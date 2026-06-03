import { Worker, Job, Queue } from 'bullmq';
import { config } from '../config';
import { query, queryOne, queryMany } from '../db';
import { whatsappService } from '../services/whatsapp';
import { emailService } from '../services/email';

export interface CampanaJob {
  campanaId: string;
  leadIds: string[];
  tipo: 'whatsapp' | 'email';
  plantillaId?: string;
  canalId: string;
  mensaje?: string;
  parametros?: string[];
}

interface Lead {
  id: string;
  contacto: string;
  empresa: string | null;
  telefono: string | null;
  email: string | null;
}

interface Campana {
  id: string;
  nombre: string;
  tipo: string;
  estado: string;
  plantilla_id: string | null;
  lead_ids: string[];
}

interface Plantilla {
  id: string;
  nombre: string;
  contenido: string;
  categoria: string;
}

const connection = { url: config.REDIS_URL };

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const worker = new Worker<CampanaJob>(
  'campana',
  async (job: Job<CampanaJob>) => {
    const { campanaId, leadIds, tipo, plantillaId, canalId, mensaje, parametros } = job.data;

    console.log(`[WorkerCampana] Starting campaign ${campanaId} with ${leadIds.length} leads`);

    // Update campaign state to 'enviando'
    await query(
      "UPDATE campanas SET estado = 'enviando' WHERE id = $1",
      [campanaId]
    );

    let plantilla: Plantilla | null = null;
    if (plantillaId) {
      plantilla = await queryOne<Plantilla>(
        'SELECT id, nombre, contenido, categoria FROM plantillas_wa WHERE id = $1',
        [plantillaId]
      );
    }

    let accessToken: string | null = null;
    let phoneNumberId: string | null = null;
    if (tipo === 'whatsapp') {
      try {
        const creds = await whatsappService.getCredentialsForChannel(canalId);
        accessToken = creds.accessToken;
        phoneNumberId = creds.phoneNumberId;
      } catch (err) {
        await query(
          "UPDATE campanas SET estado = 'error' WHERE id = $1",
          [campanaId]
        );
        throw err;
      }
    }

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < leadIds.length; i++) {
      const leadId = leadIds[i];

      try {
        const lead = await queryOne<Lead>(
          'SELECT id, contacto, empresa, telefono, email FROM leads WHERE id = $1',
          [leadId]
        );

        if (!lead) {
          failed++;
          errors.push(`Lead ${leadId}: not found`);
          continue;
        }

        // Get email canal for email campaigns
        let emailCanalId: string | null = null;
        if (tipo === 'email') {
          const emailCanal = await queryOne<{ id: string }>(
            "SELECT id FROM canales WHERE tipo = 'email' AND activo = true LIMIT 1"
          );
          emailCanalId = emailCanal?.id ?? null;
        }

        if (tipo === 'whatsapp') {
          if (!lead.telefono) {
            failed++;
            errors.push(`Lead ${leadId}: no phone number`);
            continue;
          }

          if (plantilla) {
            await whatsappService.sendTemplate(
              accessToken!,
              phoneNumberId!,
              lead.telefono,
              plantilla.nombre,
              parametros ?? []
            );
          } else if (mensaje) {
            await whatsappService.sendText(accessToken!, phoneNumberId!, lead.telefono, mensaje);
          }

          // Record message
          await query(
            `INSERT INTO mensajes (lead_id, canal_id, direccion, origen, texto, ts)
             VALUES ($1, $2, 'saliente', 'sistema', $3, NOW())`,
            [leadId, canalId, plantilla?.contenido ?? mensaje ?? '']
          );

        } else if (tipo === 'email') {
          if (!lead.email) {
            failed++;
            errors.push(`Lead ${leadId}: no email address`);
            continue;
          }

          await emailService.sendFollowUp(
            lead.email,
            {
              folio: `CAMP-${campanaId.substring(0, 8)}`,
              created_at: new Date(),
              vigencia_dias: 0,
              estado: 'enviada',
              id: campanaId,
              notas: mensaje,
            },
            {
              id: lead.id,
              contacto: lead.contacto,
              empresa: lead.empresa ?? undefined,
              email: lead.email,
              telefono: lead.telefono ?? undefined,
            }
          );

          // Record message
          if (emailCanalId) {
            await query(
              `INSERT INTO mensajes (lead_id, canal_id, direccion, origen, texto, ts)
               VALUES ($1, $2, 'saliente', 'sistema', $3, NOW())`,
              [leadId, emailCanalId, mensaje ?? `Campaña: ${campanaId}`]
            );
          }
        }

        sent++;

        // Update lead's last interaction
        await query(
          'UPDATE leads SET ultima_interaccion = NOW() WHERE id = $1',
          [leadId]
        );

        // Update job progress
        await job.updateProgress(Math.round(((i + 1) / leadIds.length) * 100));

        // 3-second delay between messages to avoid suspension
        if (i < leadIds.length - 1) {
          await delay(3000);
        }

      } catch (err) {
        failed++;
        const errorMsg = `Lead ${leadId}: ${(err as Error).message}`;
        errors.push(errorMsg);
        console.error(`[WorkerCampana] Error sending to lead ${leadId}:`, (err as Error).message);

        // On API error, add extra delay before retrying
        await delay(5000);
      }
    }

    // Update campaign to completed
    const finalEstado = failed === 0 ? 'completada' : sent > 0 ? 'completada_con_errores' : 'error';
    await query(
      `UPDATE campanas SET estado = $1, enviada_at = NOW() WHERE id = $2`,
      [finalEstado, campanaId]
    );

    console.log(
      `[WorkerCampana] Campaign ${campanaId} finished. Sent: ${sent}, Failed: ${failed}`
    );

    return {
      campanaId,
      sent,
      failed,
      total: leadIds.length,
      errors: errors.slice(0, 20), // Limit error list
    };
  },
  {
    connection,
    concurrency: 1,
  }
);

worker.on('completed', (job, result) => {
  console.log(
    `[WorkerCampana] Job ${job.id} completed. Sent: ${result.sent}/${result.total}`
  );
});

worker.on('failed', (job, err) => {
  console.error(`[WorkerCampana] Job ${job?.id} failed:`, err.message);

  if (job?.data.campanaId) {
    query(
      "UPDATE campanas SET estado = 'error' WHERE id = $1",
      [job.data.campanaId]
    ).catch(console.error);
  }
});

worker.on('error', (err) => {
  console.error('[WorkerCampana] Worker error:', err.message);
});

export const campanaQueue = new Queue<CampanaJob>('campana', { connection: { url: config.REDIS_URL } });

console.log('[WorkerCampana] campana worker started');

export { worker };
