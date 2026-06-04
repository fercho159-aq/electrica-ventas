import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { queryOne } from '../db';
import { whatsappService } from '../services/whatsapp';

const GRAPH = 'https://graph.facebook.com/v25.0';

/**
 * Sirve el media (imagen/doc/audio/video) de un mensaje de WhatsApp.
 * El media de Meta requiere el access token de la línea, así que el backend
 * lo descarga y lo retransmite. Como un <img src> no puede mandar headers,
 * el token JWT se acepta por query (?token=) además del header Authorization.
 *
 *   GET /api/media/:mensajeId?token=<jwt>
 */
const mediaPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get<{ Params: { mensajeId: string }; Querystring: { token?: string } }>(
    '/:mensajeId',
    async (request, reply) => {
      // Auth: header Bearer o ?token=
      const headerTok = (request.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const token = request.query.token || headerTok;
      try {
        fastify.jwt.verify(token);
      } catch {
        return reply.code(401).send({ error: 'Token inválido o expirado' });
      }

      const msg = await queryOne<{ media_url: string | null; tipo_media: string | null; canal_id: string }>(
        'SELECT media_url, tipo_media, canal_id FROM mensajes WHERE id = $1',
        [request.params.mensajeId]
      );

      if (!msg || !msg.media_url || !msg.media_url.startsWith('wa_media:')) {
        return reply.code(404).send({ error: 'Mensaje sin media' });
      }

      const mediaId = msg.media_url.slice('wa_media:'.length);

      let accessToken: string;
      try {
        ({ accessToken } = await whatsappService.getCredentialsForChannel(msg.canal_id));
      } catch (err) {
        return reply.code(502).send({ error: `Canal sin credenciales: ${(err as Error).message}` });
      }

      // 1) Resolver la URL temporal del media en Meta
      const metaRes = await fetch(`${GRAPH}/${mediaId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const meta = (await metaRes.json()) as { url?: string; mime_type?: string; error?: { message: string } };
      if (!metaRes.ok || !meta.url) {
        return reply.code(502).send({ error: `Meta media: ${meta.error?.message ?? 'sin url'}` });
      }

      // 2) Descargar el binario (también requiere el token)
      const binRes = await fetch(meta.url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!binRes.ok) {
        return reply.code(502).send({ error: `Descarga media falló: HTTP ${binRes.status}` });
      }
      const buf = Buffer.from(await binRes.arrayBuffer());

      reply
        .header('Content-Type', meta.mime_type || binRes.headers.get('content-type') || 'application/octet-stream')
        .header('Cache-Control', 'private, max-age=86400');
      return reply.send(buf);
    }
  );
};

export default mediaPlugin;
