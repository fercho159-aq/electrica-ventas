import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { query, queryMany, queryOne } from '../db';

type Periodo = 'mes' | 'semana' | 'hoy';

interface JwtUser {
  id: string;
  email: string;
  rol: 'gerente' | 'vendedor';
  nombre: string;
}

function getPeriodoFilter(periodo: Periodo): string {
  switch (periodo) {
    case 'hoy':
      return "AND l.created_at >= DATE_TRUNC('day', NOW())";
    case 'semana':
      return "AND l.created_at >= DATE_TRUNC('week', NOW())";
    case 'mes':
    default:
      return "AND l.created_at >= DATE_TRUNC('month', NOW())";
  }
}

function getMensajesPeriodoFilter(periodo: Periodo): string {
  switch (periodo) {
    case 'hoy':
      return "AND m.ts >= DATE_TRUNC('day', NOW())";
    case 'semana':
      return "AND m.ts >= DATE_TRUNC('week', NOW())";
    case 'mes':
    default:
      return "AND m.ts >= DATE_TRUNC('month', NOW())";
  }
}

const kpisPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preValidation', fastify.authenticate);

  // Only gerentes
  fastify.addHook('preHandler', async (request, reply) => {
    const user = request.user as JwtUser;
    if (user.rol !== 'gerente') {
      return reply.code(403).send({ error: 'Acceso restringido a gerentes' });
    }
  });

  // GET /kpis
  fastify.get(
    '/',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            periodo: { type: 'string', enum: ['mes', 'semana', 'hoy'], default: 'mes' },
          },
        },
      },
    },
    async (request, reply) => {
      const { periodo = 'mes' } = request.query as { periodo?: Periodo };
      const periodoFilter = getPeriodoFilter(periodo);
      const mensajesPeriodo = getMensajesPeriodoFilter(periodo);

      const kpis = await queryMany(
        `SELECT
           u.id as vendedor_id,
           u.nombre as vendedor_nombre,
           u.zona,
           COUNT(DISTINCT l.id) FILTER (WHERE TRUE ${periodoFilter}) as leads_nuevos,
           COUNT(DISTINCT l.id) FILTER (WHERE l.etapa NOT IN ('cerrado', 'no_cierre')) as leads_activos,
           COUNT(DISTINCT l.id) FILTER (WHERE l.etapa = 'cerrado' ${periodoFilter}) as leads_cerrados,
           COUNT(DISTINCT l.id) FILTER (WHERE l.etapa = 'no_cierre' ${periodoFilter}) as leads_no_cierre,
           COUNT(DISTINCT cot.id) FILTER (WHERE cot.created_at >= DATE_TRUNC('month', NOW())) as cotizaciones_enviadas,
           COUNT(DISTINCT cot.id) FILTER (WHERE cot.estado = 'aceptada' ${periodoFilter}) as cotizaciones_aceptadas,
           COALESCE(SUM(
             CASE WHEN l.etapa = 'cerrado' ${periodoFilter}
             THEN (SELECT SUM(ci.cantidad * ci.precio_unitario)
                   FROM cotizacion_items ci
                   JOIN cotizaciones cot2 ON ci.cotizacion_id = cot2.id
                   WHERE cot2.lead_id = l.id AND cot2.estado = 'aceptada')
             END
           ), 0) as ingresos_periodo,
           COUNT(DISTINCT m.id) FILTER (WHERE m.direccion = 'saliente' AND m.origen = 'vendedor' ${mensajesPeriodo}) as mensajes_enviados,
           COUNT(DISTINCT m.id) FILTER (WHERE m.direccion = 'entrante' ${mensajesPeriodo}) as mensajes_recibidos,
           ROUND(
             AVG(
               CASE WHEN m_resp.ts IS NOT NULL
               THEN EXTRACT(EPOCH FROM (m_resp.ts - m_entrada.ts)) / 60
               END
             )::numeric, 1
           ) as tiempo_respuesta_min_promedio,
           CASE
             WHEN COUNT(DISTINCT l.id) FILTER (WHERE TRUE ${periodoFilter}) > 0
             THEN ROUND(
               (COUNT(DISTINCT l.id) FILTER (WHERE l.etapa = 'cerrado' ${periodoFilter})::numeric /
                COUNT(DISTINCT l.id) FILTER (WHERE TRUE ${periodoFilter})::numeric) * 100, 1
             )
             ELSE 0
           END as tasa_conversion_pct
         FROM usuarios u
         LEFT JOIN leads l ON l.asignado_a = u.id
         LEFT JOIN cotizaciones cot ON cot.vendedor_id = u.id
         LEFT JOIN mensajes m ON m.usuario_id = u.id
         LEFT JOIN LATERAL (
           SELECT ts FROM mensajes WHERE lead_id = l.id AND direccion = 'entrante' ORDER BY ts ASC LIMIT 1
         ) m_entrada ON true
         LEFT JOIN LATERAL (
           SELECT ts FROM mensajes WHERE lead_id = l.id AND direccion = 'saliente' AND origen = 'vendedor' AND ts > m_entrada.ts ORDER BY ts ASC LIMIT 1
         ) m_resp ON true
         WHERE u.rol = 'vendedor' AND u.activo = true
         GROUP BY u.id, u.nombre, u.zona
         ORDER BY ingresos_periodo DESC, leads_cerrados DESC`,
        []
      );

      return reply.send({ data: kpis, periodo });
    }
  );

  // GET /kpis/:vendedorId
  fastify.get<{ Params: { vendedorId: string } }>(
    '/:vendedorId',
    async (request, reply) => {
      const { vendedorId } = request.params;

      const vendedor = await queryOne<{ id: string; nombre: string; zona: string | null }>(
        "SELECT id, nombre, zona FROM usuarios WHERE id = $1 AND rol = 'vendedor'",
        [vendedorId]
      );

      if (!vendedor) {
        return reply.code(404).send({ error: 'Vendedor no encontrado' });
      }

      // Summary stats
      const summary = await queryOne(
        `SELECT
           COUNT(DISTINCT l.id) as total_leads_activos,
           COUNT(DISTINCT l.id) FILTER (WHERE l.etapa = 'cerrado' AND l.created_at >= DATE_TRUNC('month', NOW())) as cerrados_mes,
           COUNT(DISTINCT cot.id) FILTER (WHERE cot.created_at >= DATE_TRUNC('month', NOW())) as cotizaciones_mes,
           COUNT(DISTINCT cot.id) FILTER (WHERE cot.estado = 'aceptada' AND cot.created_at >= DATE_TRUNC('month', NOW())) as cotizaciones_aceptadas_mes,
           COALESCE(SUM(
             CASE WHEN cot.estado = 'aceptada' AND cot.created_at >= DATE_TRUNC('month', NOW())
             THEN (SELECT SUM(ci.cantidad * ci.precio_unitario) FROM cotizacion_items ci WHERE ci.cotizacion_id = cot.id)
             END
           ), 0) as ingresos_mes
         FROM usuarios u
         LEFT JOIN leads l ON l.asignado_a = u.id AND l.etapa NOT IN ('cerrado', 'no_cierre')
         LEFT JOIN cotizaciones cot ON cot.vendedor_id = u.id
         WHERE u.id = $1`,
        [vendedorId]
      );

      // Daily history for last 14 days
      const historialDiario = await queryMany(
        `SELECT
           d.fecha::date as fecha,
           COUNT(DISTINCT l.id) FILTER (WHERE l.created_at::date = d.fecha::date) as leads_nuevos,
           COUNT(DISTINCT l.id) FILTER (WHERE l.etapa = 'cerrado' AND l.ultima_interaccion::date = d.fecha::date) as leads_cerrados,
           COUNT(DISTINCT m.id) FILTER (WHERE m.direccion = 'saliente' AND m.origen = 'vendedor' AND m.ts::date = d.fecha::date) as mensajes_enviados
         FROM generate_series(
           NOW() - INTERVAL '13 days',
           NOW(),
           '1 day'::interval
         ) AS d(fecha)
         LEFT JOIN leads l ON l.asignado_a = $1
         LEFT JOIN mensajes m ON m.usuario_id = $1
         GROUP BY d.fecha
         ORDER BY d.fecha ASC`,
        [vendedorId]
      );

      // Distribution by stage
      const etapas = await queryMany(
        `SELECT etapa, COUNT(*) as count
         FROM leads
         WHERE asignado_a = $1
         GROUP BY etapa
         ORDER BY
           CASE etapa
             WHEN 'nuevo' THEN 1 WHEN 'contactado' THEN 2 WHEN 'cotizado' THEN 3
             WHEN 'negociacion' THEN 4 WHEN 'cerrado' THEN 5 ELSE 6
           END`,
        [vendedorId]
      );

      return reply.send({
        data: {
          vendedor,
          summary,
          historialDiario,
          etapas,
        },
      });
    }
  );
};

export default kpisPlugin;
