import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import { query, queryOne } from '../db';
import { config } from '../config';
import Redis from 'ioredis';

const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

interface LoginBody {
  email: string;
  password: string;
}

interface RefreshBody {
  refreshToken: string;
}

interface JwtPayload {
  id: string;
  email: string;
  rol: 'gerente' | 'vendedor';
  nombre: string;
}

interface UsuarioRow {
  id: string;
  nombre: string;
  email: string;
  password_hash: string;
  rol: 'gerente' | 'vendedor';
  zona: string | null;
  activo: boolean;
}

const REFRESH_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email', maxLength: 255 },
      password: { type: 'string', minLength: 1, maxLength: 128 },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        usuario: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            nombre: { type: 'string' },
            email: { type: 'string' },
            rol: { type: 'string' },
            zona: { type: ['string', 'null'] },
          },
        },
      },
    },
  },
};

const refreshSchema = {
  body: {
    type: 'object',
    required: ['refreshToken'],
    properties: {
      refreshToken: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
};

const logoutSchema = {
  body: {
    type: 'object',
    required: ['refreshToken'],
    properties: {
      refreshToken: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
};

function generateRefreshToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  const randomValues = new Uint8Array(64);
  crypto.getRandomValues(randomValues);
  for (const val of randomValues) {
    token += chars[val % chars.length];
  }
  return token;
}

const authPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.post<{ Body: LoginBody }>(
    '/login',
    { schema: loginSchema },
    async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
      const { email, password } = request.body;

      const usuario = await queryOne<UsuarioRow>(
        'SELECT id, nombre, email, password_hash, rol, zona, activo FROM usuarios WHERE email = $1',
        [email.toLowerCase().trim()]
      );

      if (!usuario || !usuario.activo) {
        return reply.code(401).send({ error: 'Credenciales inválidas' });
      }

      const passwordValid = await bcrypt.compare(password, usuario.password_hash);
      if (!passwordValid) {
        return reply.code(401).send({ error: 'Credenciales inválidas' });
      }

      const payload: JwtPayload = {
        id: usuario.id,
        email: usuario.email,
        rol: usuario.rol,
        nombre: usuario.nombre,
      };

      const accessToken = fastify.jwt.sign(payload, {
        expiresIn: config.JWT_EXPIRES_IN as string,
      });

      const refreshToken = generateRefreshToken();
      const refreshKey = `refresh:${refreshToken}`;

      await redis.setex(
        refreshKey,
        REFRESH_TTL,
        JSON.stringify({ userId: usuario.id, email: usuario.email, rol: usuario.rol })
      );

      return reply.send({
        accessToken,
        refreshToken,
        usuario: {
          id: usuario.id,
          nombre: usuario.nombre,
          email: usuario.email,
          rol: usuario.rol,
          zona: usuario.zona,
        },
      });
    }
  );

  fastify.post<{ Body: RefreshBody }>(
    '/refresh',
    { schema: refreshSchema },
    async (request: FastifyRequest<{ Body: RefreshBody }>, reply: FastifyReply) => {
      const { refreshToken } = request.body;

      const refreshKey = `refresh:${refreshToken}`;
      const stored = await redis.get(refreshKey);

      if (!stored) {
        return reply.code(401).send({ error: 'Refresh token inválido o expirado' });
      }

      const { userId, email, rol } = JSON.parse(stored) as {
        userId: string;
        email: string;
        rol: string;
      };

      const usuario = await queryOne<UsuarioRow>(
        'SELECT id, nombre, email, rol, zona, activo FROM usuarios WHERE id = $1',
        [userId]
      );

      if (!usuario || !usuario.activo) {
        await redis.del(refreshKey);
        return reply.code(401).send({ error: 'Usuario no encontrado o inactivo' });
      }

      const payload: JwtPayload = {
        id: usuario.id,
        email: usuario.email,
        rol: usuario.rol,
        nombre: usuario.nombre,
      };

      const accessToken = fastify.jwt.sign(payload, {
        expiresIn: config.JWT_EXPIRES_IN as string,
      });

      // Rotate refresh token
      await redis.del(refreshKey);
      const newRefreshToken = generateRefreshToken();
      const newRefreshKey = `refresh:${newRefreshToken}`;
      await redis.setex(
        newRefreshKey,
        REFRESH_TTL,
        JSON.stringify({ userId: usuario.id, email: usuario.email, rol: usuario.rol })
      );

      return reply.send({
        accessToken,
        refreshToken: newRefreshToken,
        usuario: {
          id: usuario.id,
          nombre: usuario.nombre,
          email: usuario.email,
          rol: usuario.rol,
          zona: usuario.zona,
        },
      });
    }
  );

  fastify.post<{ Body: RefreshBody }>(
    '/logout',
    { schema: logoutSchema },
    async (request: FastifyRequest<{ Body: RefreshBody }>, reply: FastifyReply) => {
      const { refreshToken } = request.body;

      const refreshKey = `refresh:${refreshToken}`;
      await redis.del(refreshKey);

      return reply.code(204).send();
    }
  );

  fastify.get(
    '/me',
    {
      preValidation: [fastify.authenticate],
    },
    async (request, reply) => {
      const { id } = request.user as JwtPayload;

      const usuario = await queryOne<Omit<UsuarioRow, 'password_hash'>>(
        'SELECT id, nombre, email, rol, zona, activo FROM usuarios WHERE id = $1',
        [id]
      );

      if (!usuario) {
        return reply.code(404).send({ error: 'Usuario no encontrado' });
      }

      return reply.send({ usuario });
    }
  );
};

export default authPlugin;
