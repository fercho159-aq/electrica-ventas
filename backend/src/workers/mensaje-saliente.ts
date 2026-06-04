import { Worker, Job } from 'bullmq';
import { config } from '../config';
import { query, queryOne } from '../db';
import { whatsappService } from '../services/whatsapp';
import { emailService } from '../services/email';
import { pdfService } from '../services/pdf';

export interface MensajeSalienteJob {
  leadId: string;
  canalId: string;
  mensajeId: string;
  texto: string;
  tipo: 'whatsapp' | 'email';
  vendedorId: string;
  cotizacionId?: string;
  // Media saliente (opcional)
  mediaType?: 'image' | 'audio' | 'video' | 'document' | 'sticker';
  mediaId?: string;
  mediaFilename?: string;
}

interface LeadRow {
  id: string;
  contacto: string;
  empresa: string | null;
  telefono: string | null;
  email: string | null;
  canal_id: string | null;
}

interface CanalRow {
  id: string;
  tipo: string;
  api_key_encrypted: string | null;
}

interface VendedorRow {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  zona: string | null;
}

const connection = { url: config.REDIS_URL };

const worker = new Worker<MensajeSalienteJob>(
  'mensaje-saliente',
  async (job: Job<MensajeSalienteJob>) => {
    const { leadId, canalId, mensajeId, texto, tipo, vendedorId, cotizacionId } = job.data;

    console.log(`[Worker] Processing job ${job.id} - tipo: ${tipo}, lead: ${leadId}`);

    const lead = await queryOne<LeadRow>(
      'SELECT id, contacto, empresa, telefono, email FROM leads WHERE id = $1',
      [leadId]
    );

    if (!lead) {
      throw new Error(`Lead ${leadId} not found`);
    }

    const canal = await queryOne<CanalRow>(
      'SELECT id, tipo, api_key_encrypted FROM canales WHERE id = $1',
      [canalId]
    );

    if (!canal) {
      throw new Error(`Canal ${canalId} not found`);
    }

    let waMessageId: string | null = null;

    if (tipo === 'whatsapp') {
      if (!lead.telefono) {
        throw new Error(`Lead ${leadId} has no phone number for WhatsApp`);
      }

      const { accessToken, phoneNumberId } = await whatsappService.getCredentialsForChannel(canalId);

      if (job.data.mediaType && job.data.mediaId) {
        // Envío de media (imagen/audio/video/documento/sticker) por media_id
        waMessageId = await whatsappService.sendMediaById(
          accessToken,
          phoneNumberId,
          lead.telefono,
          job.data.mediaType,
          job.data.mediaId,
          texto,
          job.data.mediaFilename
        );
      } else if (cotizacionId) {
        // Send document via WhatsApp
        const cotizacionDocUrl = `${config.API_BASE_URL}/api/cotizaciones/${cotizacionId}/pdf`;
        waMessageId = await whatsappService.sendDocument(
          accessToken,
          phoneNumberId,
          lead.telefono,
          cotizacionDocUrl,
          texto
        );
      } else {
        waMessageId = await whatsappService.sendText(accessToken, phoneNumberId, lead.telefono, texto);
      }

    } else if (tipo === 'email') {
      if (!lead.email) {
        throw new Error(`Lead ${leadId} has no email address`);
      }

      if (cotizacionId) {
        const cotizacion = await queryOne<{
          id: string;
          folio: string;
          created_at: Date;
          vigencia_dias: number;
          notas: string | null;
          estado: string;
        }>(
          'SELECT id, folio, created_at, vigencia_dias, notas, estado FROM cotizaciones WHERE id = $1',
          [cotizacionId]
        );

        if (!cotizacion) {
          throw new Error(`Cotizacion ${cotizacionId} not found`);
        }

        const items = await query<{
          nombre: string;
          cantidad: number;
          precio_unitario: string;
        }>(
          'SELECT nombre, cantidad, precio_unitario FROM cotizacion_items WHERE cotizacion_id = $1',
          [cotizacionId]
        );

        const vendedor = await queryOne<VendedorRow>(
          'SELECT id, nombre, email, telefono, zona FROM usuarios WHERE id = $1',
          [vendedorId]
        );

        const pdfBuffer = await pdfService.generateCotizacion(
          {
            folio: cotizacion.folio,
            created_at: cotizacion.created_at,
            vigencia_dias: cotizacion.vigencia_dias,
            notas: cotizacion.notas ?? undefined,
            estado: cotizacion.estado,
          },
          items.rows.map((item) => ({
            nombre: item.nombre,
            cantidad: item.cantidad,
            precio_unitario: parseFloat(item.precio_unitario),
          })),
          {
            contacto: lead.contacto,
            empresa: lead.empresa ?? undefined,
            email: lead.email ?? undefined,
            telefono: lead.telefono ?? undefined,
          },
          {
            nombre: vendedor?.nombre ?? 'Vendedor',
            email: vendedor?.email ?? undefined,
            telefono: vendedor?.telefono ?? undefined,
            zona: vendedor?.zona ?? undefined,
          }
        );

        await emailService.sendCotizacion(
          lead.email,
          {
            folio: cotizacion.folio,
            created_at: cotizacion.created_at,
            vigencia_dias: cotizacion.vigencia_dias,
            notas: cotizacion.notas ?? undefined,
            estado: cotizacion.estado,
            id: cotizacion.id,
          },
          {
            id: lead.id,
            contacto: lead.contacto,
            empresa: lead.empresa ?? undefined,
            email: lead.email ?? undefined,
            telefono: lead.telefono ?? undefined,
          },
          pdfBuffer
        );
      } else {
        // Simple text email
        const vendedor = await queryOne<VendedorRow>(
          'SELECT id, nombre, email, telefono, zona FROM usuarios WHERE id = $1',
          [vendedorId]
        );

        await emailService.sendCotizacion(
          lead.email,
          {
            folio: `MSG-${Date.now()}`,
            created_at: new Date(),
            vigencia_dias: 0,
            estado: 'enviada',
            id: mensajeId,
          },
          {
            id: lead.id,
            contacto: lead.contacto,
            empresa: lead.empresa ?? undefined,
            email: lead.email ?? undefined,
          },
          Buffer.alloc(0)
        );
      }
    }

    // Update message status to 'enviado'
    await query(
      `UPDATE mensajes SET wa_msg_id = $1, texto = COALESCE(texto, $2), estado = 'enviado', error_detalle = NULL
       WHERE id = $3`,
      [waMessageId, texto, mensajeId]
    );

    console.log(`[Worker] Job ${job.id} completed successfully`);
    return { success: true, waMessageId };
  },
  {
    connection,
    concurrency: 5,
  }
);

worker.on('completed', (job) => {
  console.log(`[Worker] mensaje-saliente job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] mensaje-saliente job ${job?.id} failed:`, err.message);
  // Solo marca estado=error en el último intento (no en cada reintento)
  const isLastAttempt = !job || job.attemptsMade >= (job.opts.attempts ?? 1);
  if (job?.data.mensajeId && isLastAttempt) {
    query(
      "UPDATE mensajes SET estado = 'error', error_detalle = $2 WHERE id = $1",
      [job.data.mensajeId, err.message.slice(0, 500)]
    ).catch(console.error);
  }
});

worker.on('error', (err) => {
  console.error('[Worker] mensaje-saliente worker error:', err.message);
});

console.log('[Worker] mensaje-saliente worker started');

export { worker };
