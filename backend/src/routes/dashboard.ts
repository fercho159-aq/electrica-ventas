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
  fastify.get('/resumen', async (request, reply) => {
    const { excluir_informativos } = request.query as { excluir_informativos?: string | boolean };
    const exclInfo = excluir_informativos === true || excluir_informativos === 'true';
    // Filtro reutilizable (item 12): saca los leads informativos del conteo.
    const sinInfo = exclInfo ? `AND clasificacion IS DISTINCT FROM 'informativo'` : '';

    const [
      leadsStats,
      conversionStats,
      respuestaStats,
      ingresosMtd,
      ingresosPrev,
      actividadCanales,
      vendedoresActivos,
    ] = await Promise.all([
      // Leads nuevos sin asignar
      queryOne<{ leads_nuevos_sin_asignar: string }>(
        `SELECT COUNT(*) as leads_nuevos_sin_asignar
         FROM leads
         WHERE etapa = 'nuevo' AND asignado_a IS NULL ${sinInfo}`
      ),

      // Tasa de conversión (item 11): leads con venta cerrada / leads totales del mes.
      queryOne<{ total: string; cerrados: string }>(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE etapa = 'cerrado') as cerrados
         FROM leads
         WHERE created_at >= DATE_TRUNC('month', NOW()) ${sinInfo}`
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

      // Ingresos Month-to-Date (item 10): cotizaciones aceptadas en el mes.
      // Usa monto_cerrado cuando hay cierre (soporta parcial); si no, suma de partidas.
      queryOne<{ ingresos_mtd: string }>(
        `SELECT COALESCE(SUM(
           COALESCE(cot.monto_cerrado,
             (SELECT SUM(ci.cantidad * ci.precio_unitario)
              FROM cotizacion_items ci WHERE ci.cotizacion_id = cot.id))
         ), 0) as ingresos_mtd
         FROM cotizaciones cot
         WHERE cot.estado = 'aceptada'
           AND COALESCE(cot.cerrada_at, cot.created_at) >= DATE_TRUNC('month', NOW())`
      ),

      // Ingresos del mes anterior (item 10): base para el comparativo mes-a-mes.
      queryOne<{ ingresos_prev: string }>(
        `SELECT COALESCE(SUM(
           COALESCE(cot.monto_cerrado,
             (SELECT SUM(ci.cantidad * ci.precio_unitario)
              FROM cotizacion_items ci WHERE ci.cotizacion_id = cot.id))
         ), 0) as ingresos_prev
         FROM cotizaciones cot
         WHERE cot.estado = 'aceptada'
           AND COALESCE(cot.cerrada_at, cot.created_at) >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
           AND COALESCE(cot.cerrada_at, cot.created_at) < DATE_TRUNC('month', NOW())`
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

    const totalLeads = parseInt(conversionStats?.total ?? '0', 10);
    const cerradosLeads = parseInt(conversionStats?.cerrados ?? '0', 10);
    const tasaConversion = totalLeads > 0
      ? Math.round((cerradosLeads / totalLeads) * 100 * 10) / 10
      : 0;

    const ingresosMtdVal = parseFloat(ingresosMtd?.ingresos_mtd ?? '0');
    const ingresosPrevVal = parseFloat(ingresosPrev?.ingresos_prev ?? '0');
    // Comparativo mes-a-mes (item 10): null cuando no hay base del mes anterior.
    const ingresosMtdDeltaPct = ingresosPrevVal > 0
      ? Math.round(((ingresosMtdVal - ingresosPrevVal) / ingresosPrevVal) * 100 * 10) / 10
      : null;

    return reply.send({
      data: {
        leads_nuevos_sin_asignar: parseInt(leadsStats?.leads_nuevos_sin_asignar ?? '0', 10),
        tasa_conversion_pct: tasaConversion,
        leads_total_mtd: totalLeads,
        leads_cerrados_mtd: cerradosLeads,
        excluir_informativos: exclInfo,
        respuesta_promedio_min: respuestaStats?.respuesta_promedio_min
          ? parseFloat(respuestaStats.respuesta_promedio_min)
          : null,
        ingresos_mtd: ingresosMtdVal,
        ingresos_mtd_mes_anterior: ingresosPrevVal,
        ingresos_mtd_delta_pct: ingresosMtdDeltaPct,
        actividad_canales: actividadCanales,
        vendedores_activos: parseInt(vendedoresActivos?.total ?? '0', 10),
      },
    });
  });

  // GET /dashboard/embudo
  fastify.get('/embudo', async (request, reply) => {
    const { excluir_informativos } = request.query as { excluir_informativos?: string | boolean };
    const exclInfo = excluir_informativos === true || excluir_informativos === 'true';
    const sinInfo = exclInfo ? `WHERE clasificacion IS DISTINCT FROM 'informativo'` : '';

    const etapas = await queryMany<{ etapa: string; count: string }>(
      `SELECT etapa, COUNT(*) as count
       FROM leads
       ${sinInfo}
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
