import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { queryOne, queryMany } from '../db';

interface JwtUser {
  id: string;
  email: string;
  rol: 'gerente' | 'vendedor';
  nombre: string;
}

const dashboardPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preValidation', fastify.authenticate);

  fastify.addHook('preHandler', async (request, reply) => {
    const user = request.user as JwtUser;
    if (user.rol !== 'gerente') {
      return reply.code(403).send({ error: 'Acceso restringido a gerentes' });
    }
  });

  // GET /dashboard/resumen
  fastify.get('/resumen', async (_request, reply) => {
    const [
      leadsStats,
      conversionStats,
      respuestaStats,
      ingresosMtd,
      actividadCanales,
      vendedoresActivos,
    ] = await Promise.all([
      // Leads nuevos sin asignar
      queryOne<{ leads_nuevos_sin_asignar: string }>(
        `SELECT COUNT(*) as leads_nuevos_sin_asignar
         FROM leads
         WHERE etapa = 'nuevo' AND asignado_a IS NULL`
      ),

      // Tasa de conversión (cotizaciones aceptadas / total cotizaciones)
      queryOne<{ total: string; aceptadas: string }>(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE estado = 'aceptada') as aceptadas
         FROM cotizaciones
         WHERE created_at >= DATE_TRUNC('month', NOW())`
      ),

      // Tiempo de respuesta promedio en minutos
      queryOne<{ respuesta_promedio_min: string | null }>(
        `SELECT ROUND(AVG(
           EXTRACT(EPOCH FROM (primera_respuesta.ts - primer_entrante.ts)) / 60
         )::numeric, 1) as respuesta_promedio_min
         FROM leads l
         JOIN LATERAL (
           SELECT ts FROM mensajes
           WHERE lead_id = l.id AND direccion = 'entrante'
           ORDER BY ts ASC LIMIT 1
         ) primer_entrante ON true
         JOIN LATERAL (
           SELECT ts FROM mensajes
           WHERE lead_id = l.id AND direccion = 'saliente' AND origen = 'vendedor'
             AND ts > primer_entrante.ts
           ORDER BY ts ASC LIMIT 1
         ) primera_respuesta ON true
         WHERE l.created_at >= DATE_TRUNC('month', NOW())`
      ),

      // Ingresos Month-to-Date (sum of accepted cotizaciones for closed leads)
      queryOne<{ ingresos_mtd: string }>(
        `SELECT COALESCE(SUM(
           (SELECT SUM(ci.cantidad * ci.precio_unitario)
            FROM cotizacion_items ci
            JOIN cotizaciones cot ON ci.cotizacion_id = cot.id
            WHERE cot.lead_id = l.id AND cot.estado = 'aceptada')
         ), 0) as ingresos_mtd
         FROM leads l
         WHERE l.etapa = 'cerrado'
           AND l.ultima_interaccion >= DATE_TRUNC('month', NOW())`
      ),

      // Activity by channel (last 24h)
      queryMany(
        `SELECT
           c.id as canal_id,
           c.nombre as canal_nombre,
           c.tipo as canal_tipo,
           COUNT(m.id) FILTER (WHERE m.ts >= NOW() - INTERVAL '24 hours') as mensajes_24h,
           COUNT(DISTINCT l.id) FILTER (WHERE l.created_at >= NOW() - INTERVAL '24 hours') as leads_nuevos_24h
         FROM canales c
         LEFT JOIN mensajes m ON m.canal_id = c.id
         LEFT JOIN leads l ON l.canal_id = c.id
         WHERE c.activo = true
         GROUP BY c.id, c.nombre, c.tipo
         ORDER BY mensajes_24h DESC`
      ),

      // Active vendors count
      queryOne<{ total: string }>(
        "SELECT COUNT(*) as total FROM usuarios WHERE rol = 'vendedor' AND activo = true"
      ),
    ]);

    const totalCotizaciones = parseInt(conversionStats?.total ?? '0', 10);
    const aceptadasCotizaciones = parseInt(conversionStats?.aceptadas ?? '0', 10);
    const tasaConversion = totalCotizaciones > 0
      ? Math.round((aceptadasCotizaciones / totalCotizaciones) * 100 * 10) / 10
      : 0;

    return reply.send({
      data: {
        leads_nuevos_sin_asignar: parseInt(leadsStats?.leads_nuevos_sin_asignar ?? '0', 10),
        tasa_conversion_pct: tasaConversion,
        cotizaciones_total_mtd: totalCotizaciones,
        cotizaciones_aceptadas_mtd: aceptadasCotizaciones,
        respuesta_promedio_min: respuestaStats?.respuesta_promedio_min
          ? parseFloat(respuestaStats.respuesta_promedio_min)
          : null,
        ingresos_mtd: parseFloat(ingresosMtd?.ingresos_mtd ?? '0'),
        actividad_canales: actividadCanales,
        vendedores_activos: parseInt(vendedoresActivos?.total ?? '0', 10),
      },
    });
  });

  // GET /dashboard/embudo
  fastify.get('/embudo', async (_request, reply) => {
    const etapas = await queryMany<{ etapa: string; count: string }>(
      `SELECT etapa, COUNT(*) as count
       FROM leads
       GROUP BY etapa
       ORDER BY
         CASE etapa
           WHEN 'nuevo' THEN 1
           WHEN 'contactado' THEN 2
           WHEN 'cotizado' THEN 3
           WHEN 'negociacion' THEN 4
           WHEN 'cerrado' THEN 5
           WHEN 'no_cierre' THEN 6
           ELSE 7
         END`
    );

    const total = etapas.reduce((sum, row) => sum + parseInt(row.count, 10), 0);

    const embudo = etapas.map((row) => ({
      etapa: row.etapa,
      count: parseInt(row.count, 10),
      porcentaje: total > 0 ? Math.round((parseInt(row.count, 10) / total) * 100 * 10) / 10 : 0,
    }));

    // Monthly trend (last 6 months)
    const tendencia = await queryMany(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as mes,
         etapa,
         COUNT(*) as count
       FROM leads
       WHERE created_at >= NOW() - INTERVAL '6 months'
       GROUP BY DATE_TRUNC('month', created_at), etapa
       ORDER BY mes ASC, etapa ASC`
    );

    return reply.send({
      data: {
        embudo,
        total,
        tendencia,
      },
    });
  });
};

export default dashboardPlugin;
