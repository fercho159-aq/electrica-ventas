import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { query, queryOne, queryMany } from '../db';
import { wsHub } from '../ws/hub';

type Etapa = 'nuevo' | 'contactado' | 'cotizado' | 'negociacion' | 'cerrado' | 'no_cierre';
type Prioridad = 'alta' | 'media' | 'baja';
type Rol = 'gerente' | 'vendedor';

interface JwtUser {
  id: string;
  email: string;
  rol: Rol;
  nombre: string;
}

const ETAPA_TRANSITIONS: Record<Etapa, Etapa[]> = {
  nuevo: ['contactado', 'no_cierre'],
  contactado: ['cotizado', 'no_cierre'],
  cotizado: ['negociacion', 'no_cierre'],
  negociacion: ['cerrado', 'no_cierre'],
  cerrado: [],
  no_cierre: ['nuevo'],
};

const leadsPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // All routes require JWT
  fastify.addHook('preValidation', fastify.authenticate);

  // GET /leads
  fastify.get(
    '/',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            etapa: { type: 'string' },
            asignado_a: { type: 'string' },
            canal_id: { type: 'string' },
            prioridad: { type: 'string' },
            buscar: { type: 'string' },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 500, default: 20 },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user as JwtUser;
      const {
        etapa,
        asignado_a,
        canal_id,
        prioridad,
        buscar,
        page = 1,
        limit = 20,
      } = request.query as {
        etapa?: string;
        asignado_a?: string;
        canal_id?: string;
        prioridad?: string;
        buscar?: string;
        page?: number;
        limit?: number;
      };

      const offset = (page - 1) * limit;
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      // Vendedores only see their own leads
      if (user.rol === 'vendedor') {
        conditions.push(`l.asignado_a = $${paramIdx++}`);
        params.push(user.id);
      } else if (asignado_a) {
        conditions.push(`l.asignado_a = $${paramIdx++}`);
        params.push(asignado_a);
      }

      if (etapa) {
        conditions.push(`l.etapa = $${paramIdx++}`);
        params.push(etapa);
      }

      if (canal_id) {
        conditions.push(`l.canal_id = $${paramIdx++}`);
        params.push(canal_id);
      }

      if (prioridad) {
        conditions.push(`l.prioridad = $${paramIdx++}`);
        params.push(prioridad);
      }

      if (buscar) {
        conditions.push(
          `(l.contacto ILIKE $${paramIdx} OR l.empresa ILIKE $${paramIdx} OR l.telefono ILIKE $${paramIdx} OR l.email ILIKE $${paramIdx})`
        );
        params.push(`%${buscar}%`);
        paramIdx++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await query<{ total: string }>(
        `SELECT COUNT(*) as total FROM leads l ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].total, 10);

      const leads = await queryMany(
        `SELECT
           l.id, l.contacto, l.empresa, l.telefono, l.email,
           l.etapa, l.prioridad, l.zona, l.monto_estimado, l.notas, l.motivo_no_cierre,
           l.created_at, l.ultima_interaccion,
           c.id as canal_id, c.nombre as canal_nombre, c.tipo as canal_tipo,
           u.id as vendedor_id, u.nombre as vendedor_nombre, u.zona as vendedor_zona,
           (SELECT texto FROM mensajes WHERE lead_id = l.id ORDER BY ts DESC LIMIT 1) as ultimo_mensaje
         FROM leads l
         LEFT JOIN canales c ON l.canal_id = c.id
         LEFT JOIN usuarios u ON l.asignado_a = u.id
         ${whereClause}
         ORDER BY l.ultima_interaccion DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, limit, offset]
      );

      return reply.send({
        data: leads,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      });
    }
  );

  // GET /leads/:id
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    async (request, reply) => {
      const user = request.user as JwtUser;
      const { id } = request.params;

      const lead = await queryOne(
        `SELECT
           l.id, l.contacto, l.empresa, l.telefono, l.email,
           l.etapa, l.prioridad, l.zona, l.monto_estimado, l.motivo_no_cierre,
           l.notas, l.created_at, l.ultima_interaccion,
           c.id as canal_id, c.nombre as canal_nombre, c.tipo as canal_tipo,
           u.id as vendedor_id, u.nombre as vendedor_nombre, u.email as vendedor_email,
           u.zona as vendedor_zona, u.telefono as vendedor_telefono
         FROM leads l
         LEFT JOIN canales c ON l.canal_id = c.id
         LEFT JOIN usuarios u ON l.asignado_a = u.id
         WHERE l.id = $1`,
        [id]
      );

      if (!lead) {
        return reply.code(404).send({ error: 'Lead no encontrado' });
      }

      // Vendedores can only see their assigned leads
      if (user.rol === 'vendedor' && (lead as { vendedor_id: string | null }).vendedor_id !== user.id) {
        return reply.code(403).send({ error: 'No tienes permiso para ver este lead' });
      }

      return reply.send({ data: lead });
    }
  );

  // POST /leads
  fastify.post(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['contacto'],
          properties: {
            contacto: { type: 'string', minLength: 1, maxLength: 255 },
            empresa: { type: 'string', maxLength: 255 },
            telefono: { type: 'string', maxLength: 50 },
            email: { type: 'string', format: 'email', maxLength: 255 },
            canal_id: { type: 'string', format: 'uuid' },
            prioridad: { type: 'string', enum: ['alta', 'media', 'baja'] },
            zona: { type: 'string', maxLength: 100 },
            monto_estimado: { type: 'number', minimum: 0 },
            notas: { type: 'string', maxLength: 2000 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const user = request.user as JwtUser;
      const body = request.body as {
        contacto: string;
        empresa?: string;
        telefono?: string;
        email?: string;
        canal_id?: string;
        prioridad?: Prioridad;
        zona?: string;
        monto_estimado?: number;
        notas?: string;
      };

      const result = await query<{ id: string }>(
        `INSERT INTO leads (contacto, empresa, telefono, email, canal_id, prioridad, zona, monto_estimado, notas, asignado_a)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          body.contacto,
          body.empresa ?? null,
          body.telefono ?? null,
          body.email ?? null,
          body.canal_id ?? null,
          body.prioridad ?? 'media',
          body.zona ?? null,
          body.monto_estimado ?? null,
          body.notas ?? null,
          user.rol === 'vendedor' ? user.id : null,
        ]
      );

      const leadId = result.rows[0].id;

      // System message for creation
      await query(
        `INSERT INTO mensajes (lead_id, canal_id, direccion, origen, usuario_id, texto, ts)
         VALUES ($1, $2, 'saliente', 'sistema', $3, $4, NOW())`,
        [
          leadId,
          body.canal_id ?? null,
          user.id,
          `Lead creado por ${user.nombre}`,
        ]
      );

      // Update canal last interaction
      if (body.canal_id) {
        await query(
          'UPDATE canales SET activo = activo WHERE id = $1',
          [body.canal_id]
        );
      }

      const newLead = await queryOne(
        `SELECT l.*, c.nombre as canal_nombre, u.nombre as vendedor_nombre
         FROM leads l
         LEFT JOIN canales c ON l.canal_id = c.id
         LEFT JOIN usuarios u ON l.asignado_a = u.id
         WHERE l.id = $1`,
        [leadId]
      );

      return reply.code(201).send({ data: newLead });
    }
  );

  // PATCH /leads/:id
  fastify.patch<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            contacto: { type: 'string', minLength: 1, maxLength: 255 },
            empresa: { type: 'string', maxLength: 255 },
            telefono: { type: 'string', maxLength: 50 },
            email: { type: 'string', format: 'email', maxLength: 255 },
            prioridad: { type: 'string', enum: ['alta', 'media', 'baja'] },
            zona: { type: 'string', maxLength: 100 },
            monto_estimado: { type: 'number', minimum: 0 },
            notas: { type: 'string', maxLength: 2000 },
            motivo_no_cierre: { type: 'string', maxLength: 500 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const user = request.user as JwtUser;
      const { id } = request.params;
      const body = request.body as Record<string, unknown>;

      const existing = await queryOne<{ asignado_a: string | null }>(
        'SELECT asignado_a FROM leads WHERE id = $1',
        [id]
      );

      if (!existing) {
        return reply.code(404).send({ error: 'Lead no encontrado' });
      }

      if (user.rol === 'vendedor' && existing.asignado_a !== user.id) {
        return reply.code(403).send({ error: 'No tienes permiso para editar este lead' });
      }

      const allowedFields = ['contacto', 'empresa', 'telefono', 'email', 'prioridad', 'zona', 'monto_estimado', 'notas', 'motivo_no_cierre'];
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIdx = 1;

      for (const field of allowedFields) {
        if (field in body) {
          updates.push(`${field} = $${paramIdx++}`);
          values.push(body[field]);
        }
      }

      if (updates.length === 0) {
        return reply.code(400).send({ error: 'No hay campos para actualizar' });
      }

      updates.push(`ultima_interaccion = NOW()`);
      values.push(id);

      await query(
        `UPDATE leads SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
        values
      );

      const updated = await queryOne(
        `SELECT l.*, c.nombre as canal_nombre, u.nombre as vendedor_nombre
         FROM leads l
         LEFT JOIN canales c ON l.canal_id = c.id
         LEFT JOIN usuarios u ON l.asignado_a = u.id
         WHERE l.id = $1`,
        [id]
      );

      return reply.send({ data: updated });
    }
  );

  // PATCH /leads/:id/etapa
  fastify.patch<{ Params: { id: string } }>(
    '/:id/etapa',
    {
      schema: {
        body: {
          type: 'object',
          required: ['etapa'],
          properties: {
            etapa: { type: 'string', enum: ['nuevo', 'contactado', 'cotizado', 'negociacion', 'cerrado', 'no_cierre'] },
            motivo_no_cierre: { type: 'string', maxLength: 500 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const user = request.user as JwtUser;
      const { id } = request.params;
      const { etapa, motivo_no_cierre } = request.body as { etapa: Etapa; motivo_no_cierre?: string };

      const existing = await queryOne<{ etapa: Etapa; asignado_a: string | null }>(
        'SELECT etapa, asignado_a FROM leads WHERE id = $1',
        [id]
      );

      if (!existing) {
        return reply.code(404).send({ error: 'Lead no encontrado' });
      }

      if (user.rol === 'vendedor' && existing.asignado_a !== user.id) {
        return reply.code(403).send({ error: 'No tienes permiso para modificar este lead' });
      }

      const allowedTransitions = ETAPA_TRANSITIONS[existing.etapa];
      if (!allowedTransitions.includes(etapa)) {
        return reply.code(422).send({
          error: `Transición inválida: ${existing.etapa} → ${etapa}`,
          allowed: allowedTransitions,
        });
      }

      if (etapa === 'no_cierre' && !motivo_no_cierre) {
        return reply.code(422).send({ error: 'Se requiere motivo_no_cierre para esta transición' });
      }

      await query(
        `UPDATE leads SET etapa = $1, motivo_no_cierre = $2, ultima_interaccion = NOW() WHERE id = $3`,
        [etapa, motivo_no_cierre ?? null, id]
      );

      // System message for stage change
      await query(
        `INSERT INTO mensajes (lead_id, direccion, origen, usuario_id, texto, ts)
         VALUES ($1, 'saliente', 'sistema', $2, $3, NOW())`,
        [
          id,
          user.id,
          `Etapa actualizada: ${existing.etapa} → ${etapa}${motivo_no_cierre ? `. Motivo: ${motivo_no_cierre}` : ''}`,
        ]
      );

      // Notify via WebSocket
      wsHub.broadcast(id, {
        type: 'etapa_changed',
        leadId: id,
        etapaAnterior: existing.etapa,
        etapaNueva: etapa,
        cambiadoPor: user.nombre,
        timestamp: new Date().toISOString(),
      });

      const updated = await queryOne(
        `SELECT l.*, c.nombre as canal_nombre, u.nombre as vendedor_nombre
         FROM leads l
         LEFT JOIN canales c ON l.canal_id = c.id
         LEFT JOIN usuarios u ON l.asignado_a = u.id
         WHERE l.id = $1`,
        [id]
      );

      return reply.send({ data: updated });
    }
  );

  // PATCH /leads/:id/asignar
  fastify.patch<{ Params: { id: string } }>(
    '/:id/asignar',
    {
      schema: {
        body: {
          type: 'object',
          required: ['vendedor_id'],
          properties: {
            vendedor_id: { type: 'string', format: 'uuid' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const user = request.user as JwtUser;

      if (user.rol !== 'gerente') {
        return reply.code(403).send({ error: 'Solo los gerentes pueden asignar leads' });
      }

      const { id } = request.params;
      const { vendedor_id } = request.body as { vendedor_id: string };

      const lead = await queryOne<{ id: string }>(
        'SELECT id FROM leads WHERE id = $1',
        [id]
      );

      if (!lead) {
        return reply.code(404).send({ error: 'Lead no encontrado' });
      }

      const vendedor = await queryOne<{ nombre: string }>(
        "SELECT nombre FROM usuarios WHERE id = $1 AND rol = 'vendedor' AND activo = true",
        [vendedor_id]
      );

      if (!vendedor) {
        return reply.code(404).send({ error: 'Vendedor no encontrado o inactivo' });
      }

      await query(
        "UPDATE leads SET asignado_a = $1, ultima_interaccion = NOW(), etapa = CASE WHEN etapa = 'nuevo' THEN 'contactado' ELSE etapa END WHERE id = $2",
        [vendedor_id, id]
      );

      await query(
        `INSERT INTO mensajes (lead_id, direccion, origen, usuario_id, texto, ts)
         VALUES ($1, 'saliente', 'sistema', $2, $3, NOW())`,
        [
          id,
          user.id,
          `Lead asignado a ${vendedor.nombre} por ${user.nombre}`,
        ]
      );

      wsHub.broadcast(id, {
        type: 'lead_assigned',
        leadId: id,
        vendedorId: vendedor_id,
        vendedorNombre: vendedor.nombre,
        asignadoPor: user.nombre,
        timestamp: new Date().toISOString(),
      });

      const updated = await queryOne(
        `SELECT l.*, c.nombre as canal_nombre, u.nombre as vendedor_nombre
         FROM leads l
         LEFT JOIN canales c ON l.canal_id = c.id
         LEFT JOIN usuarios u ON l.asignado_a = u.id
         WHERE l.id = $1`,
        [id]
      );

      return reply.send({ data: updated });
    }
  );
};

export default leadsPlugin;
