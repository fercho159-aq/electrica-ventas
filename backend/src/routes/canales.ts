import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { queryMany } from '../db';

const canalesPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preValidation', fastify.authenticate);

  // GET /canales
  fastify.get('/', async (_request, reply) => {
    const canales = await queryMany(
      `SELECT
         id, tipo, nombre, numero, activo, created_at
       FROM canales
       WHERE activo = true
       ORDER BY tipo ASC, nombre ASC`
    );

    return reply.send({ data: canales });
  });

  // GET /canales/actividad
  fastify.get('/actividad', async (_request, reply) => {
    const actividad = await queryMany(
      `SELECT
         c.id as canal_id,
         c.nombre as canal_nombre,
         c.tipo as canal_tipo,
         COUNT(DISTINCT m.id) FILTER (WHERE m.ts >= NOW() - INTERVAL '24 hours') as mensajes_24h,
         COUNT(DISTINCT m.id) FILTER (WHERE m.ts >= NOW() - INTERVAL '24 hours' AND m.direccion = 'entrante') as mensajes_entrantes_24h,
         COUNT(DISTINCT m.id) FILTER (WHERE m.ts >= NOW() - INTERVAL '24 hours' AND m.direccion = 'saliente') as mensajes_salientes_24h,
         COUNT(DISTINCT l.id) FILTER (WHERE l.created_at >= NOW() - INTERVAL '24 hours') as leads_nuevos_24h,
         COUNT(DISTINCT l.id) FILTER (WHERE l.etapa NOT IN ('cerrado', 'no_cierre')) as leads_activos_total,
         MAX(m.ts) as ultima_actividad
       FROM canales c
       LEFT JOIN mensajes m ON m.canal_id = c.id
       LEFT JOIN leads l ON l.canal_id = c.id
       WHERE c.activo = true
       GROUP BY c.id, c.nombre, c.tipo
       ORDER BY mensajes_24h DESC`
    );

    return reply.send({ data: actividad });
  });
};

export default canalesPlugin;
