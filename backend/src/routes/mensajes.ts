import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { query, queryOne, queryMany } from '../db';
import { config } from '../config';
import { MensajeSalienteJob } from '../workers/mensaje-saliente';
import { whatsappService } from '../services/whatsapp';
import { transcodeAudioForWhatsApp } from '../services/audio';

type Rol = 'gerente' | 'vendedor';

interface JwtUser {
  id: string;
  email: string;
  rol: Rol;
  nombre: string;
}

const mensajeSalienteQueue = new Queue<MensajeSalienteJob>('mensaje-saliente', {
  connection: { url: config.REDIS_URL },
});

const mensajesPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preValidation', fastify.authenticate);

  // GET /leads/:id/mensajes
  fastify.get<{ Params: { id: string } }>(
    '/:id/mensajes',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            cursor: { type: 'string' }, // ISO timestamp for pagination
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user as JwtUser;
      const { id } = request.params;
      const { cursor, limit = 30 } = request.query as { cursor?: string; limit?: number };

      // Check lead exists and access rights
      const lead = await queryOne<{ id: string; asignado_a: string | null; canal_id: string | null }>(
        'SELECT id, asignado_a, canal_id FROM leads WHERE id = $1',
        [id]
      );

      if (!lead) {
        return reply.code(404).send({ error: 'Lead no encontrado' });
      }

      if (user.rol === 'vendedor' && lead.asignado_a !== user.id) {
        return reply.code(403).send({ error: 'No tienes acceso a este lead' });
      }

      const params: unknown[] = [id, limit + 1];
      let cursorCondition = '';

      if (cursor) {
        cursorCondition = `AND m.ts < $3`;
        params.push(cursor);
      }

      const mensajes = await queryMany(
        `SELECT
           m.id, m.lead_id, m.canal_id, m.direccion, m.origen,
           m.usuario_id, m.texto, m.tipo_media, m.media_url, m.wa_msg_id, m.ts,
           m.estado, m.error_detalle,
           c.nombre as canal_nombre, c.tipo as canal_tipo,
           u.nombre as usuario_nombre
         FROM mensajes m
         LEFT JOIN canales c ON m.canal_id = c.id
         LEFT JOIN usuarios u ON m.usuario_id = u.id
         WHERE m.lead_id = $1
           ${cursorCondition}
         ORDER BY m.ts DESC
         LIMIT $2`,
        params
      );

      const hasMore = mensajes.length > limit;
      const data = hasMore ? mensajes.slice(0, limit) : mensajes;
      const nextCursor = hasMore ? (data[data.length - 1] as { ts: string }).ts : null;

      return reply.send({
        data,
        pagination: {
          hasMore,
          nextCursor,
          limit,
        },
      });
    }
  );

  // POST /leads/:id/mensajes
  fastify.post<{ Params: { id: string } }>(
    '/:id/mensajes',
    {
      schema: {
        body: {
          type: 'object',
          required: ['texto', 'canal_id', 'tipo'],
          properties: {
            texto: { type: 'string', minLength: 1, maxLength: 4096 },
            canal_id: { type: 'string', format: 'uuid' },
            tipo: { type: 'string', enum: ['whatsapp', 'email'] },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const user = request.user as JwtUser;
      const { id: leadId } = request.params;
      const { texto, canal_id, tipo } = request.body as {
        texto: string;
        canal_id: string;
        tipo: 'whatsapp' | 'email';
      };

      const lead = await queryOne<{ id: string; asignado_a: string | null }>(
        'SELECT id, asignado_a FROM leads WHERE id = $1',
        [leadId]
      );

      if (!lead) {
        return reply.code(404).send({ error: 'Lead no encontrado' });
      }

      if (user.rol === 'vendedor' && lead.asignado_a !== user.id) {
        return reply.code(403).send({ error: 'No tienes permiso para enviar mensajes a este lead' });
      }

      const canal = await queryOne<{ id: string; tipo: string }>(
        'SELECT id, tipo FROM canales WHERE id = $1 AND activo = true',
        [canal_id]
      );

      if (!canal) {
        return reply.code(404).send({ error: 'Canal no encontrado o inactivo' });
      }

      // Insert message as pending
      const msgResult = await query<{ id: string }>(
        `INSERT INTO mensajes (lead_id, canal_id, direccion, origen, usuario_id, texto, ts)
         VALUES ($1, $2, 'saliente', 'vendedor', $3, $4, NOW())
         RETURNING id`,
        [leadId, canal_id, user.id, texto]
      );

      const mensajeId = msgResult.rows[0].id;

      // Update lead last interaction + avanzar de 'nuevo' a 'contactado' al primer saliente
      await query(
        "UPDATE leads SET ultima_interaccion = NOW(), etapa = CASE WHEN etapa = 'nuevo' THEN 'contactado' ELSE etapa END WHERE id = $1",
        [leadId]
      );

      // Enqueue for sending
      await mensajeSalienteQueue.add(
        'send',
        {
          leadId,
          canalId: canal_id,
          mensajeId,
          texto,
          tipo,
          vendedorId: user.id,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        }
      );

      // Publish to Redis pub/sub for real-time notification
      const redisPublisher = new Redis(config.REDIS_URL, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });

      await redisPublisher.connect();
      await redisPublisher.publish(
        `lead:${leadId}`,
        JSON.stringify({
          type: 'mensaje_saliente',
          leadId,
          mensajeId,
          texto,
          tipo,
          vendedorId: user.id,
          vendedorNombre: user.nombre,
          canalId: canal_id,
          timestamp: new Date().toISOString(),
        })
      );
      await redisPublisher.disconnect();

      const mensaje = await queryOne(
        `SELECT m.*, c.nombre as canal_nombre, u.nombre as usuario_nombre
         FROM mensajes m
         LEFT JOIN canales c ON m.canal_id = c.id
         LEFT JOIN usuarios u ON m.usuario_id = u.id
         WHERE m.id = $1`,
        [mensajeId]
      );

      return reply.code(201).send({ data: mensaje });
    }
  );

  // POST /leads/:id/media — enviar imagen/audio/video/documento/sticker
  fastify.post<{ Params: { id: string } }>(
    '/:id/media',
    {
      schema: {
        body: {
          type: 'object',
          required: ['filename', 'mime', 'dataB64'],
          properties: {
            filename: { type: 'string', minLength: 1, maxLength: 255 },
            mime: { type: 'string', minLength: 1, maxLength: 100 },
            dataB64: { type: 'string', minLength: 1 },
            caption: { type: 'string', maxLength: 1024 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const user = request.user as JwtUser;
      const { id: leadId } = request.params;
      const { filename, mime, dataB64, caption } = request.body as {
        filename: string; mime: string; dataB64: string; caption?: string;
      };

      const lead = await queryOne<{ id: string; asignado_a: string | null; telefono: string | null; canal_id: string | null }>(
        'SELECT id, asignado_a, telefono, canal_id FROM leads WHERE id = $1',
        [leadId]
      );
      if (!lead) return reply.code(404).send({ error: 'Lead no encontrado' });
      if (user.rol === 'vendedor' && lead.asignado_a !== user.id) {
        return reply.code(403).send({ error: 'Sin permiso para este lead' });
      }
      if (!lead.canal_id) return reply.code(400).send({ error: 'Lead sin canal de WhatsApp' });
      if (!lead.telefono) return reply.code(400).send({ error: 'Lead sin teléfono' });

      const canal = await queryOne<{ id: string; tipo: string }>(
        "SELECT id, tipo FROM canales WHERE id = $1 AND activo = true",
        [lead.canal_id]
      );
      if (!canal || canal.tipo !== 'whatsapp') {
        return reply.code(400).send({ error: 'Canal de WhatsApp no disponible' });
      }

      // Determinar tipo de media por mime
      let mediaType: 'image' | 'audio' | 'video' | 'document' | 'sticker';
      if (mime === 'image/webp') mediaType = 'sticker';
      else if (mime.startsWith('image/')) mediaType = 'image';
      else if (mime.startsWith('audio/')) mediaType = 'audio';
      else if (mime.startsWith('video/')) mediaType = 'video';
      else mediaType = 'document';

      let buffer = Buffer.from(dataB64, 'base64');
      if (buffer.length > 16 * 1024 * 1024) {
        return reply.code(413).send({ error: 'Archivo demasiado grande (máx 16MB)' });
      }

      // Audio → AAC/M4A (audio/mp4). El ogg/opus del ffmpeg del VPS lo rechaza WhatsApp;
      // el AAC/MP4 es portable y siempre se reproduce.
      let upMime = mime;
      let upName = filename;
      if (mediaType === 'audio' && mime !== 'audio/mp4') {
        try {
          buffer = Buffer.from(await transcodeAudioForWhatsApp(buffer));
          upMime = 'audio/mp4';
          upName = filename.replace(/\.[^.]+$/, '') + '.m4a';
        } catch (err) {
          return reply.code(502).send({ error: `No se pudo convertir el audio: ${(err as Error).message}` });
        }
      }

      // Subir a Meta
      let mediaId: string;
      try {
        const { accessToken, phoneNumberId } = await whatsappService.getCredentialsForChannel(lead.canal_id);
        mediaId = await whatsappService.uploadMedia(accessToken, phoneNumberId, buffer, upMime, upName);
      } catch (err) {
        return reply.code(502).send({ error: `No se pudo subir a Meta: ${(err as Error).message}` });
      }

      const textoBubble = caption
        || (mediaType === 'image' ? '[Imagen]' : mediaType === 'sticker' ? '[Sticker]'
          : mediaType === 'audio' ? '[Audio]' : mediaType === 'video' ? '[Video]' : filename);

      const msgResult = await query<{ id: string }>(
        `INSERT INTO mensajes (lead_id, canal_id, direccion, origen, usuario_id, texto, tipo_media, media_url, ts)
         VALUES ($1, $2, 'saliente', 'vendedor', $3, $4, $5, $6, NOW())
         RETURNING id`,
        [leadId, lead.canal_id, user.id, textoBubble, mediaType, `wa_media:${mediaId}`]
      );
      const mensajeId = msgResult.rows[0].id;

      await query(
        "UPDATE leads SET ultima_interaccion = NOW(), etapa = CASE WHEN etapa = 'nuevo' THEN 'contactado' ELSE etapa END WHERE id = $1",
        [leadId]
      );

      await mensajeSalienteQueue.add(
        'send',
        {
          leadId, canalId: lead.canal_id, mensajeId, texto: caption || '', tipo: 'whatsapp',
          vendedorId: user.id, mediaType, mediaId, mediaFilename: filename,
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
      );

      const redisPublisher = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
      await redisPublisher.connect();
      await redisPublisher.publish(`lead:${leadId}`, JSON.stringify({
        type: 'mensaje_saliente', leadId, mensajeId, texto: textoBubble, tipo: 'whatsapp',
        tipoMedia: mediaType, vendedorId: user.id, canalId: lead.canal_id, timestamp: new Date().toISOString(),
      }));
      await redisPublisher.disconnect();

      const mensaje = await queryOne(
        `SELECT m.*, c.nombre as canal_nombre, u.nombre as usuario_nombre
         FROM mensajes m LEFT JOIN canales c ON m.canal_id = c.id LEFT JOIN usuarios u ON m.usuario_id = u.id
         WHERE m.id = $1`,
        [mensajeId]
      );
      return reply.code(201).send({ data: mensaje });
    }
  );
};

export default mensajesPlugin;
