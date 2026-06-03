import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { Queue } from 'bullmq';
import { query, queryOne, queryMany, withTransaction } from '../db';
import { config } from '../config';
import { pdfService } from '../services/pdf';
import { MensajeSalienteJob } from '../workers/mensaje-saliente';

type Rol = 'gerente' | 'vendedor';
type EstadoCotizacion = 'enviada' | 'vista' | 'aceptada' | 'rechazada' | 'pendiente';

interface JwtUser {
  id: string;
  email: string;
  rol: Rol;
  nombre: string;
}

interface CotizacionItem {
  producto_id?: string;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
}

const mensajeSalienteQueue = new Queue<MensajeSalienteJob>('mensaje-saliente', {
  connection: { url: config.REDIS_URL },
});

async function generateFolio(): Promise<string> {
  const year = new Date().getFullYear();
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM cotizaciones WHERE EXTRACT(YEAR FROM created_at) = $1`,
    [year]
  );
  const count = parseInt(result.rows[0].count, 10) + 1;
  return `COT-${year}-${String(count).padStart(4, '0')}`;
}

const cotizacionesPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preValidation', fastify.authenticate);

  // GET /cotizaciones
  fastify.get(
    '/',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            vendedor_id: { type: 'string' },
            estado: { type: 'string' },
            lead_id: { type: 'string' },
            fecha_desde: { type: 'string' },
            fecha_hasta: { type: 'string' },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user as JwtUser;
      const {
        vendedor_id,
        estado,
        lead_id,
        fecha_desde,
        fecha_hasta,
        page = 1,
        limit = 20,
      } = request.query as {
        vendedor_id?: string;
        estado?: string;
        lead_id?: string;
        fecha_desde?: string;
        fecha_hasta?: string;
        page?: number;
        limit?: number;
      };

      const offset = (page - 1) * limit;
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (user.rol === 'vendedor') {
        conditions.push(`cot.vendedor_id = $${paramIdx++}`);
        params.push(user.id);
      } else if (vendedor_id) {
        conditions.push(`cot.vendedor_id = $${paramIdx++}`);
        params.push(vendedor_id);
      }

      if (estado) {
        conditions.push(`cot.estado = $${paramIdx++}`);
        params.push(estado);
      }

      if (lead_id) {
        conditions.push(`cot.lead_id = $${paramIdx++}`);
        params.push(lead_id);
      }

      if (fecha_desde) {
        conditions.push(`cot.created_at >= $${paramIdx++}`);
        params.push(fecha_desde);
      }

      if (fecha_hasta) {
        conditions.push(`cot.created_at <= $${paramIdx++}`);
        params.push(fecha_hasta);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await query<{ total: string }>(
        `SELECT COUNT(*) as total FROM cotizaciones cot ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].total, 10);

      const cotizaciones = await queryMany(
        `SELECT
           cot.id, cot.folio, cot.estado, cot.vigencia_dias, cot.notas,
           cot.pdf_url, cot.created_at,
           l.id as lead_id, l.contacto as lead_contacto, l.empresa as lead_empresa,
           u.id as vendedor_id, u.nombre as vendedor_nombre,
           (SELECT SUM(ci.cantidad * ci.precio_unitario)
            FROM cotizacion_items ci WHERE ci.cotizacion_id = cot.id) as monto_total,
           (SELECT COUNT(*) FROM cotizacion_items ci WHERE ci.cotizacion_id = cot.id) as num_items
         FROM cotizaciones cot
         JOIN leads l ON cot.lead_id = l.id
         LEFT JOIN usuarios u ON cot.vendedor_id = u.id
         ${whereClause}
         ORDER BY cot.created_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, limit, offset]
      );

      return reply.send({
        data: cotizaciones,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      });
    }
  );

  // POST /cotizaciones
  fastify.post(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['lead_id', 'items'],
          properties: {
            lead_id: { type: 'string', format: 'uuid' },
            vigencia_dias: { type: 'integer', minimum: 1, default: 15 },
            notas: { type: 'string', maxLength: 2000 },
            items: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['nombre', 'cantidad', 'precio_unitario'],
                properties: {
                  producto_id: { type: 'string', format: 'uuid' },
                  nombre: { type: 'string', minLength: 1, maxLength: 255 },
                  cantidad: { type: 'integer', minimum: 1 },
                  precio_unitario: { type: 'number', minimum: 0 },
                },
              },
            },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const user = request.user as JwtUser;
      const { lead_id, vigencia_dias = 15, notas, items } = request.body as {
        lead_id: string;
        vigencia_dias?: number;
        notas?: string;
        items: CotizacionItem[];
      };

      const lead = await queryOne<{ id: string; asignado_a: string | null }>(
        'SELECT id, asignado_a FROM leads WHERE id = $1',
        [lead_id]
      );

      if (!lead) {
        return reply.code(404).send({ error: 'Lead no encontrado' });
      }

      if (user.rol === 'vendedor' && lead.asignado_a !== user.id) {
        return reply.code(403).send({ error: 'No tienes permiso para crear cotizaciones para este lead' });
      }

      const folio = await generateFolio();

      const cotizacion = await withTransaction(async (client) => {
        const cotResult = await client.query<{ id: string }>(
          `INSERT INTO cotizaciones (folio, lead_id, vendedor_id, estado, vigencia_dias, notas)
           VALUES ($1, $2, $3, 'pendiente', $4, $5)
           RETURNING id`,
          [folio, lead_id, user.id, vigencia_dias, notas ?? null]
        );

        const cotizacionId = cotResult.rows[0].id;

        for (const item of items) {
          await client.query(
            `INSERT INTO cotizacion_items (cotizacion_id, producto_id, nombre, cantidad, precio_unitario)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              cotizacionId,
              item.producto_id ?? null,
              item.nombre,
              item.cantidad,
              item.precio_unitario,
            ]
          );
        }

        // Update lead stage to 'cotizado' if it was in 'contactado'
        await client.query(
          `UPDATE leads SET etapa = 'cotizado', ultima_interaccion = NOW()
           WHERE id = $1 AND etapa = 'contactado'`,
          [lead_id]
        );

        // System message
        await client.query(
          `INSERT INTO mensajes (lead_id, direccion, origen, usuario_id, texto, ts)
           VALUES ($1, 'saliente', 'sistema', $2, $3, NOW())`,
          [lead_id, user.id, `Cotización ${folio} creada`]
        );

        return cotizacionId;
      });

      const created = await queryOne(
        `SELECT cot.*, l.contacto as lead_contacto, l.empresa as lead_empresa, u.nombre as vendedor_nombre,
                (SELECT SUM(ci.cantidad * ci.precio_unitario) FROM cotizacion_items ci WHERE ci.cotizacion_id = cot.id) as monto_total
         FROM cotizaciones cot
         JOIN leads l ON cot.lead_id = l.id
         LEFT JOIN usuarios u ON cot.vendedor_id = u.id
         WHERE cot.id = $1`,
        [cotizacion]
      );

      const itemsCreated = await queryMany(
        'SELECT * FROM cotizacion_items WHERE cotizacion_id = $1',
        [cotizacion]
      );

      return reply.code(201).send({ data: { ...created, items: itemsCreated } });
    }
  );

  // PATCH /cotizaciones/:id/estado
  fastify.patch<{ Params: { id: string } }>(
    '/:id/estado',
    {
      schema: {
        body: {
          type: 'object',
          required: ['estado'],
          properties: {
            estado: { type: 'string', enum: ['enviada', 'vista', 'aceptada', 'rechazada', 'pendiente'] },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const user = request.user as JwtUser;
      const { id } = request.params;
      const { estado } = request.body as { estado: EstadoCotizacion };

      const cotizacion = await queryOne<{
        id: string;
        vendedor_id: string | null;
        lead_id: string;
        folio: string;
      }>(
        'SELECT id, vendedor_id, lead_id, folio FROM cotizaciones WHERE id = $1',
        [id]
      );

      if (!cotizacion) {
        return reply.code(404).send({ error: 'Cotización no encontrada' });
      }

      if (user.rol === 'vendedor' && cotizacion.vendedor_id !== user.id) {
        return reply.code(403).send({ error: 'No tienes permiso para modificar esta cotización' });
      }

      await query(
        'UPDATE cotizaciones SET estado = $1 WHERE id = $2',
        [estado, id]
      );

      // If accepted, move lead to cerrado
      if (estado === 'aceptada') {
        await query(
          `UPDATE leads SET etapa = 'cerrado', ultima_interaccion = NOW()
           WHERE id = $1 AND etapa NOT IN ('cerrado', 'no_cierre')`,
          [cotizacion.lead_id]
        );

        await query(
          `INSERT INTO mensajes (lead_id, direccion, origen, usuario_id, texto, ts)
           VALUES ($1, 'saliente', 'sistema', $2, $3, NOW())`,
          [cotizacion.lead_id, user.id, `Cotización ${cotizacion.folio} aceptada - Lead cerrado`]
        );
      }

      const updated = await queryOne(
        `SELECT cot.*,
                (SELECT SUM(ci.cantidad * ci.precio_unitario) FROM cotizacion_items ci WHERE ci.cotizacion_id = cot.id) as monto_total
         FROM cotizaciones cot WHERE cot.id = $1`,
        [id]
      );

      return reply.send({ data: updated });
    }
  );

  // GET /cotizaciones/:id/pdf
  fastify.get<{ Params: { id: string } }>(
    '/:id/pdf',
    async (request, reply) => {
      const user = request.user as JwtUser;
      const { id } = request.params;

      const cotizacion = await queryOne<{
        id: string;
        folio: string;
        lead_id: string;
        vendedor_id: string | null;
        estado: string;
        vigencia_dias: number;
        notas: string | null;
        created_at: Date;
      }>(
        'SELECT id, folio, lead_id, vendedor_id, estado, vigencia_dias, notas, created_at FROM cotizaciones WHERE id = $1',
        [id]
      );

      if (!cotizacion) {
        return reply.code(404).send({ error: 'Cotización no encontrada' });
      }

      if (user.rol === 'vendedor' && cotizacion.vendedor_id !== user.id) {
        return reply.code(403).send({ error: 'No tienes permiso para ver esta cotización' });
      }

      const lead = await queryOne<{
        contacto: string;
        empresa: string | null;
        email: string | null;
        telefono: string | null;
      }>(
        'SELECT contacto, empresa, email, telefono FROM leads WHERE id = $1',
        [cotizacion.lead_id]
      );

      const vendedor = await queryOne<{
        nombre: string;
        email: string | null;
        telefono: string | null;
        zona: string | null;
      }>(
        'SELECT nombre, email, telefono, zona FROM usuarios WHERE id = $1',
        [cotizacion.vendedor_id ?? user.id]
      );

      const items = await queryMany<{
        nombre: string;
        cantidad: number;
        precio_unitario: string;
      }>(
        'SELECT nombre, cantidad, precio_unitario FROM cotizacion_items WHERE cotizacion_id = $1',
        [id]
      );

      const pdfBuffer = await pdfService.generateCotizacion(
        {
          folio: cotizacion.folio,
          created_at: cotizacion.created_at,
          vigencia_dias: cotizacion.vigencia_dias,
          notas: cotizacion.notas ?? undefined,
          estado: cotizacion.estado,
        },
        items.map((item) => ({
          nombre: item.nombre,
          cantidad: item.cantidad,
          precio_unitario: parseFloat(item.precio_unitario),
        })),
        {
          contacto: lead?.contacto ?? 'Cliente',
          empresa: lead?.empresa ?? undefined,
          email: lead?.email ?? undefined,
          telefono: lead?.telefono ?? undefined,
        },
        {
          nombre: vendedor?.nombre ?? user.nombre,
          email: vendedor?.email ?? undefined,
          telefono: vendedor?.telefono ?? undefined,
          zona: vendedor?.zona ?? undefined,
        }
      );

      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="${cotizacion.folio}.pdf"`)
        .header('Content-Length', pdfBuffer.length)
        .send(pdfBuffer);
    }
  );

  // POST /cotizaciones/:id/enviar
  fastify.post<{ Params: { id: string } }>(
    '/:id/enviar',
    {
      schema: {
        body: {
          type: 'object',
          required: ['canal'],
          properties: {
            canal: { type: 'string', enum: ['whatsapp', 'email'] },
            canal_id: { type: 'string', format: 'uuid' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const user = request.user as JwtUser;
      const { id } = request.params;
      const { canal, canal_id } = request.body as {
        canal: 'whatsapp' | 'email';
        canal_id?: string;
      };

      const cotizacion = await queryOne<{
        id: string;
        folio: string;
        lead_id: string;
        vendedor_id: string | null;
      }>(
        'SELECT id, folio, lead_id, vendedor_id FROM cotizaciones WHERE id = $1',
        [id]
      );

      if (!cotizacion) {
        return reply.code(404).send({ error: 'Cotización no encontrada' });
      }

      if (user.rol === 'vendedor' && cotizacion.vendedor_id !== user.id) {
        return reply.code(403).send({ error: 'No tienes permiso para enviar esta cotización' });
      }

      const lead = await queryOne<{
        id: string;
        canal_id: string | null;
        telefono: string | null;
        email: string | null;
        contacto: string;
      }>(
        'SELECT id, canal_id, telefono, email, contacto FROM leads WHERE id = $1',
        [cotizacion.lead_id]
      );

      if (!lead) {
        return reply.code(404).send({ error: 'Lead no encontrado' });
      }

      // Determine which canal to use
      let targetCanalId = canal_id ?? lead.canal_id;

      if (!targetCanalId) {
        // Find appropriate canal by type
        const foundCanal = await queryOne<{ id: string }>(
          'SELECT id FROM canales WHERE tipo = $1 AND activo = true LIMIT 1',
          [canal]
        );
        targetCanalId = foundCanal?.id ?? null;
      }

      if (!targetCanalId) {
        return reply.code(400).send({ error: `No se encontró un canal activo de tipo ${canal}` });
      }

      // Insert message record
      const msgResult = await query<{ id: string }>(
        `INSERT INTO mensajes (lead_id, canal_id, direccion, origen, usuario_id, texto, ts)
         VALUES ($1, $2, 'saliente', 'vendedor', $3, $4, NOW())
         RETURNING id`,
        [
          cotizacion.lead_id,
          targetCanalId,
          user.id,
          `Cotización ${cotizacion.folio} enviada por ${canal}`,
        ]
      );

      // Enqueue for sending
      await mensajeSalienteQueue.add(
        'send-cotizacion',
        {
          leadId: cotizacion.lead_id,
          canalId: targetCanalId,
          mensajeId: msgResult.rows[0].id,
          texto: `Cotización ${cotizacion.folio} adjunta`,
          tipo: canal,
          vendedorId: user.id,
          cotizacionId: id,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        }
      );

      // Update cotizacion status to 'enviada'
      await query(
        "UPDATE cotizaciones SET estado = 'enviada' WHERE id = $1",
        [id]
      );

      return reply.send({
        success: true,
        message: `Cotización ${cotizacion.folio} encolada para envío por ${canal}`,
      });
    }
  );
};

export default cotizacionesPlugin;
