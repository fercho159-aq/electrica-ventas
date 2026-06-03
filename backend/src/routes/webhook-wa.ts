import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { query, queryOne } from '../db';
import { whatsappService } from '../services/whatsapp';
import { asignacionService } from '../services/asignacion';
import Redis from 'ioredis';
import { config } from '../config';

const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

interface WaWebhookBody {
  object?: string;
  entry?: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata?: { phone_number_id: string; display_phone_number: string };
        contacts?: Array<{ wa_id: string; profile: { name: string } }>;
        messages?: Array<{
          id: string;
          from: string;
          timestamp: string;
          type: string;
          text?: { body: string };
          image?: { caption?: string; mime_type: string; id: string };
          document?: { caption?: string; filename: string; mime_type: string; id: string };
          audio?: { mime_type: string; id: string };
          video?: { caption?: string; mime_type: string; id: string };
          sticker?: { mime_type: string; id: string };
        }>;
      };
      field: string;
    }>;
  }>;
}

const webhookWaPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Webhook verification (GET) for 360dialog / Meta
  fastify.get<{ Params: { canalId: string } }>(
    '/:canalId',
    async (request, reply) => {
      const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': verifyToken } =
        request.query as { 'hub.mode'?: string; 'hub.challenge'?: string; 'hub.verify_token'?: string };

      if (mode === 'subscribe' && verifyToken) {
        const canal = await queryOne<{ webhook_secret: string | null }>(
          'SELECT webhook_secret FROM canales WHERE id = $1 AND activo = true',
          [request.params.canalId]
        );

        if (canal?.webhook_secret === verifyToken) {
          return reply.send(parseInt(challenge ?? '0', 10));
        }
      }

      return reply.code(403).send({ error: 'Verification failed' });
    }
  );

  // Main webhook handler (POST) — NO JWT auth
  fastify.post<{ Params: { canalId: string } }>(
    '/:canalId',
    async (request, reply) => {
      const { canalId } = request.params;

      // Respond 200 immediately to avoid webhook timeout
      // Processing continues asynchronously
      reply.code(200).send({ status: 'ok' });

      // Get canal with secret for HMAC validation
      const canal = await queryOne<{
        id: string;
        nombre: string;
        tipo: string;
        webhook_secret: string | null;
        activo: boolean;
      }>(
        'SELECT id, nombre, tipo, webhook_secret, activo FROM canales WHERE id = $1',
        [canalId]
      );

      if (!canal || !canal.activo) {
        fastify.log.warn(`Webhook for inactive/unknown canal: ${canalId}`);
        return;
      }

      // HMAC-SHA256 validation
      const signature = request.headers['x-hub-signature-256'] as string;
      if (canal.webhook_secret) {
        const rawBody = (request as { rawBody?: Buffer }).rawBody;
        if (!rawBody) {
          fastify.log.warn(`No raw body available for HMAC validation on canal ${canalId}`);
          return;
        }

        const isValid = whatsappService.validateWebhookSignature(
          rawBody,
          signature,
          canal.webhook_secret
        );

        if (!isValid) {
          fastify.log.warn(`Invalid HMAC signature for canal ${canalId}`);
          return;
        }
      }

      // Process webhook payload
      const body = request.body as WaWebhookBody;

      if (!body.entry || body.entry.length === 0) {
        return;
      }

      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.field !== 'messages') continue;

          const { messages, contacts } = change.value;
          if (!messages || messages.length === 0) continue;

          for (const message of messages) {
            try {
              await processWhatsAppMessage(message, contacts, canalId);
            } catch (err) {
              fastify.log.error(`Error processing WA message ${message.id}: ${(err as Error).message}`);
            }
          }
        }
      }
    }
  );
};

async function processWhatsAppMessage(
  message: {
    id: string;
    from: string;
    timestamp: string;
    type: string;
    text?: { body: string };
    image?: { caption?: string; mime_type: string; id: string };
    document?: { caption?: string; filename: string; mime_type: string; id: string };
    audio?: { mime_type: string; id: string };
    video?: { caption?: string; mime_type: string; id: string };
    sticker?: { mime_type: string; id: string };
  },
  contacts: Array<{ wa_id: string; profile: { name: string } }> | undefined,
  canalId: string
): Promise<void> {
  const waMsgId = message.id;

  // Deduplication check
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM mensajes WHERE wa_msg_id = $1',
    [waMsgId]
  );

  if (existing) {
    console.log(`[Webhook] Duplicate message ${waMsgId}, skipping`);
    return;
  }

  const phoneFrom = message.from;
  const contactName = contacts?.find((c) => c.wa_id === phoneFrom)?.profile?.name ?? phoneFrom;

  // Extract message text based on type
  let texto: string | null = null;
  let tipoMedia: string | null = null;
  let mediaUrl: string | null = null;

  switch (message.type) {
    case 'text':
      texto = message.text?.body ?? null;
      break;
    case 'image':
      tipoMedia = 'image';
      mediaUrl = message.image?.id ? `wa_media:${message.image.id}` : null;
      texto = message.image?.caption ?? '[Imagen]';
      break;
    case 'document':
      tipoMedia = 'document';
      mediaUrl = message.document?.id ? `wa_media:${message.document.id}` : null;
      texto = message.document?.caption ?? message.document?.filename ?? '[Documento]';
      break;
    case 'audio':
      tipoMedia = 'audio';
      texto = '[Audio]';
      break;
    case 'video':
      tipoMedia = 'video';
      texto = message.video?.caption ?? '[Video]';
      break;
    default:
      texto = `[${message.type}]`;
  }

  // Find or create lead
  let lead = await queryOne<{ id: string; asignado_a: string | null; etapa: string }>(
    'SELECT id, asignado_a, etapa FROM leads WHERE telefono = $1 AND canal_id = $2 LIMIT 1',
    [phoneFrom, canalId]
  );

  let isNewLead = false;

  if (!lead) {
    const result = await query<{ id: string }>(
      `INSERT INTO leads (contacto, telefono, canal_id, etapa, prioridad, ultima_interaccion)
       VALUES ($1, $2, $3, 'nuevo', 'media', NOW())
       RETURNING id`,
      [contactName, phoneFrom, canalId]
    );
    lead = { id: result.rows[0].id, asignado_a: null, etapa: 'nuevo' };
    isNewLead = true;
    console.log(`[Webhook] Created new lead ${lead.id} for phone ${phoneFrom}`);
  }

  // Insert message
  const msgResult = await query<{ id: string }>(
    `INSERT INTO mensajes (lead_id, canal_id, direccion, origen, texto, tipo_media, media_url, wa_msg_id, ts)
     VALUES ($1, $2, 'entrante', 'cliente', $3, $4, $5, $6, TO_TIMESTAMP($7))
     RETURNING id`,
    [
      lead.id,
      canalId,
      texto,
      tipoMedia,
      mediaUrl,
      waMsgId,
      parseInt(message.timestamp, 10),
    ]
  );

  // Update lead last interaction
  await query(
    'UPDATE leads SET ultima_interaccion = NOW() WHERE id = $1',
    [lead.id]
  );

  // Auto-assign if new lead
  if (isNewLead && !lead.asignado_a) {
    try {
      await asignacionService.asignarLead(lead.id, canalId);
    } catch (err) {
      console.error(`[Webhook] Auto-assign failed for lead ${lead.id}:`, (err as Error).message);
    }
  }

  // Publish to Redis for real-time push
  const event = {
    type: 'mensaje_entrante',
    leadId: lead.id,
    mensajeId: msgResult.rows[0].id,
    canal: 'whatsapp',
    canalId,
    phoneFrom,
    texto,
    tipoMedia,
    waMsgId,
    isNewLead,
    timestamp: new Date().toISOString(),
  };

  await redis.publish(`lead:${lead.id}`, JSON.stringify(event));
}

export default webhookWaPlugin;
