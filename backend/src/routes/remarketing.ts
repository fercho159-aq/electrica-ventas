import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { Queue } from 'bullmq';
import { query, queryMany } from '../db';
import { config } from '../config';
import { runRecordatorios } from '../services/recordatorios';
import { CampanaJob } from '../workers/campana';

type Rol = 'gerente' | 'vendedor';
interface JwtUser { id: string; email: string; rol: Rol; nombre: string }

const campanaQueue = new Queue<CampanaJob>('campana', { connection: { url: config.REDIS_URL } });

// Segmentos automáticos (TODO item 13). Cada uno devuelve el conjunto de leads.
const SEGMENTOS: Record<string, { label: string; where: string; joins?: string }> = {
  cotizo_no_cerro: {
    label: 'Cotizó y no cerró',
    joins: `JOIN cotizaciones cot ON cot.lead_id = l.id`,
    where: `l.etapa NOT IN ('cerrado', 'no_cierre')`,
  },
  cotizacion_vencida: {
    label: 'Cotización vencida',
    joins: `JOIN cotizaciones cot ON cot.lead_id = l.id`,
    where: `cot.estado IN ('enviada', 'vista', 'pendiente')
            AND cot.created_at + (cot.vigencia_dias || ' days')::interval < NOW()
            AND l.etapa <> 'cerrado'`,
  },
  informativo_interesado: {
    label: 'Informativo interesado',
    where: `l.clasificacion = 'informativo' AND l.etapa <> 'no_cierre'`,
  },
  sin_compra_60d: {
    label: 'Sin compra en 60 días',
    where: `l.etapa <> 'cerrado' AND l.cerrado_en_mostrador = false
            AND l.ultima_interaccion < NOW() - INTERVAL '60 days'`,
  },
};

function segmentQuery(key: string, user: JwtUser): { sql: string; params: unknown[] } | null {
  const seg = SEGMENTOS[key];
  if (!seg) return null;
  const params: unknown[] = [];
  let roleFilter = '';
  if (user.rol === 'vendedor') {
    params.push(user.id);
    roleFilter = `AND l.asignado_a = $1`;
  }
  const sql = `
    SELECT DISTINCT l.id, l.contacto, l.empresa, l.telefono, l.email, l.etapa,
           l.clasificacion, l.zona, l.motivo_no_cierre, l.ultima_interaccion,
           u.nombre AS vendedor_nombre, c.nombre AS canal_nombre, l.canal_id
    FROM leads l
    LEFT JOIN usuarios u ON l.asignado_a = u.id
    LEFT JOIN canales c ON l.canal_id = c.id
    ${seg.joins ?? ''}
    WHERE ${seg.where} ${roleFilter}
    ORDER BY l.ultima_interaccion ASC`;
  return { sql, params };
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.join(',');
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n');
  return `${header}\n${body}`;
}

const remarketingPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preValidation', fastify.authenticate);

  // GET /remarketing/segmentos — conteo por segmento
  fastify.get('/segmentos', async (request, reply) => {
    const user = request.user as JwtUser;
    const out: { key: string; label: string; count: number }[] = [];
    for (const key of Object.keys(SEGMENTOS)) {
      const q = segmentQuery(key, user)!;
      const rows = await queryMany<{ id: string }>(q.sql, q.params);
      out.push({ key, label: SEGMENTOS[key].label, count: rows.length });
    }
    return reply.send({ data: out });
  });

  // GET /remarketing/segmentos/:key — leads del segmento
  fastify.get<{ Params: { key: string } }>('/segmentos/:key', async (request, reply) => {
    const user = request.user as JwtUser;
    const q = segmentQuery(request.params.key, user);
    if (!q) return reply.code(404).send({ error: 'Segmento desconocido' });
    const rows = await queryMany(q.sql, q.params);
    return reply.send({ data: rows, segmento: SEGMENTOS[request.params.key].label });
  });

  // GET /remarketing/export?segmento=key — exporta CSV para campañas FB/IG (item 17)
  fastify.get('/export', async (request, reply) => {
    const user = request.user as JwtUser;
    const { segmento } = request.query as { segmento?: string };
    if (!segmento) return reply.code(400).send({ error: 'Falta ?segmento=' });
    const q = segmentQuery(segmento, user);
    if (!q) return reply.code(404).send({ error: 'Segmento desconocido' });
    const rows = await queryMany<Record<string, unknown>>(q.sql, q.params);
    const csv = toCsv(rows);
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="segmento-${segmento}.csv"`)
      .send(csv);
  });

  // GET /remarketing/plantillas — plantillas WA aprobadas para reenvío (item 15)
  fastify.get('/plantillas', async (_request, reply) => {
    const rows = await queryMany(
      `SELECT id, nombre, categoria, contenido, estado_meta, canal_id
       FROM plantillas_wa ORDER BY nombre ASC`
    );
    return reply.send({ data: rows });
  });

  // POST /remarketing/recontactar — reenvío en un clic (item 15)
  fastify.post(
    '/recontactar',
    {
      schema: {
        body: {
          type: 'object',
          required: ['lead_ids', 'canal_id'],
          properties: {
            lead_ids: { type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1 },
            canal_id: { type: 'string', format: 'uuid' },
            plantilla_id: { type: 'string', format: 'uuid' },
            mensaje: { type: 'string', maxLength: 2000 },
            tipo: { type: 'string', enum: ['whatsapp', 'email'], default: 'whatsapp' },
            nombre: { type: 'string', maxLength: 255 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const user = request.user as JwtUser;
      const { lead_ids, canal_id, plantilla_id, mensaje, tipo = 'whatsapp', nombre } =
        request.body as {
          lead_ids: string[];
          canal_id: string;
          plantilla_id?: string;
          mensaje?: string;
          tipo?: 'whatsapp' | 'email';
          nombre?: string;
        };

      if (!plantilla_id && !mensaje) {
        return reply.code(422).send({ error: 'Se requiere plantilla_id o mensaje' });
      }

      const campana = await queryMany<{ id: string }>(
        `INSERT INTO campanas (nombre, tipo, estado, plantilla_id, lead_ids, creada_por)
         VALUES ($1, $2, 'encolada', $3, $4, $5) RETURNING id`,
        [nombre ?? `Recontacto ${new Date().toISOString().slice(0, 10)}`, tipo, plantilla_id ?? null, lead_ids, user.id]
      );
      const campanaId = campana[0].id;

      await campanaQueue.add(
        'recontactar',
        { campanaId, leadIds: lead_ids, tipo, plantillaId: plantilla_id, canalId: canal_id, mensaje },
        { attempts: 2, backoff: { type: 'exponential', delay: 3000 } }
      );

      return reply.send({ success: true, campana_id: campanaId, total: lead_ids.length });
    }
  );

  // POST /remarketing/recordatorios/run — dispara la pasada de recordatorios (item 14)
  fastify.post('/recordatorios/run', async (request, reply) => {
    const user = request.user as JwtUser;
    if (user.rol !== 'gerente') {
      return reply.code(403).send({ error: 'Solo gerentes' });
    }
    const { dias } = request.query as { dias?: string };
    const result = await runRecordatorios(dias ? parseInt(dias, 10) : 3);
    return reply.send({ data: result });
  });
};

export default remarketingPlugin;
