import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { queryMany } from '../db';
import { asignacionService } from '../services/asignacion';

interface JwtUser {
  id: string;
  email: string;
  rol: 'gerente' | 'vendedor';
  nombre: string;
}

const asignacionPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preValidation', fastify.authenticate);

  fastify.addHook('preHandler', async (request, reply) => {
    const user = request.user as JwtUser;
    if (user.rol !== 'gerente') {
      return reply.code(403).send({ error: 'Acceso restringido a gerentes' });
    }
  });

  // GET /asignacion/reglas
  fastify.get('/reglas', async (_request, reply) => {
    const reglas = await queryMany(
      `SELECT ar.*, c.nombre as canal_nombre, c.tipo as canal_tipo
       FROM asignacion_reglas ar
       JOIN canales c ON ar.canal_id = c.id
       WHERE c.activo = true
       ORDER BY c.nombre ASC`
    );

    return reply.send({ data: reglas });
  });

  // PUT /asignacion/reglas/:canalId
  fastify.put<{ Params: { canalId: string } }>(
    '/reglas/:canalId',
    {
      schema: {
        body: {
          type: 'object',
          required: ['modo'],
          properties: {
            modo: { type: 'string', enum: ['round_robin', 'carga', 'manual'] },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { canalId } = request.params;
      const { modo } = request.body as { modo: 'round_robin' | 'carga' | 'manual' };

      const regla = await asignacionService.cambiarModo(canalId, modo);

      return reply.send({ data: regla });
    }
  );

  // POST /asignacion/auto
  fastify.post(
    '/auto',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            canal_id: { type: 'string', format: 'uuid' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { canal_id } = (request.body as { canal_id?: string }) ?? {};

      const resultados = await asignacionService.autoAsignarPendientes(canal_id);

      return reply.send({
        data: {
          asignaciones: resultados,
          total: resultados.length,
          resumen: `Se realizaron ${resultados.length} asignaciones automáticas`,
        },
      });
    }
  );
};

export default asignacionPlugin;
