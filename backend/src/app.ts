import 'dotenv/config';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyJwt from '@fastify/jwt';
import fastifyWebsocket from '@fastify/websocket';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { WebSocket } from 'ws';

import { config } from './config';
import { healthCheck, closePool } from './db';
import { wsHub } from './ws/hub';

// Route plugins
import authPlugin from './routes/auth';
import leadsPlugin from './routes/leads';
import mensajesPlugin from './routes/mensajes';
import cotizacionesPlugin from './routes/cotizaciones';
import kpisPlugin from './routes/kpis';
import dashboardPlugin from './routes/dashboard';
import canalesPlugin from './routes/canales';
import asignacionPlugin from './routes/asignacion';
import mediaPlugin from './routes/media';
import webhookWaPlugin from './routes/webhook-wa';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      id: string;
      email: string;
      rol: 'gerente' | 'vendedor';
      nombre: string;
    };
    user: {
      id: string;
      email: string;
      rol: 'gerente' | 'vendedor';
      nombre: string;
    };
  }
}

async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        config.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    trustProxy: true,
    bodyLimit: 10 * 1024 * 1024, // 10MB
  });

  // ─── RAW BODY FOR HMAC VALIDATION ──────────────────────────────
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body: Buffer, done) => {
      try {
        (req as FastifyRequest & { rawBody: Buffer }).rawBody = body;
        const json = JSON.parse(body.toString()) as unknown;
        done(null, json);
      } catch (err) {
        done(err as Error);
      }
    }
  );

  // ─── PLUGINS ────────────────────────────────────────────────────
  await fastify.register(fastifyCors, {
    origin: config.CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-hub-signature-256'],
  });

  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await fastify.register(fastifyRateLimit, {
    global: true,
    max: 500,
    timeWindow: '1 minute',
    redis: new Redis(config.REDIS_URL, { maxRetriesPerRequest: 3 }),
    skipOnError: true,
    keyGenerator: (request) => {
      return request.headers['x-forwarded-for'] as string ?? request.ip;
    },
  });

  await fastify.register(fastifyJwt, {
    secret: config.JWT_SECRET,
    sign: {
      expiresIn: config.JWT_EXPIRES_IN,
    },
  });

  await fastify.register(fastifyWebsocket, {
    options: {
      maxPayload: 1048576, // 1MB
    },
  });

  // ─── AUTHENTICATE DECORATOR ─────────────────────────────────────
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: 'Token inválido o expirado' });
    }
  });

  // ─── HEALTH CHECK ────────────────────────────────────────────────
  fastify.get('/health', async (_request, reply) => {
    const dbOk = await healthCheck();
    const status = dbOk ? 200 : 503;
    return reply.code(status).send({
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    });
  });

  // ─── BULL BOARD ─────────────────────────────────────────────────
  const bullConnection = { url: config.REDIS_URL };

  const mensajeSalienteQueue = new Queue('mensaje-saliente', { connection: bullConnection });
  const campanaQueue = new Queue('campana', { connection: bullConnection });
  const imapSyncQueue = new Queue('imap-sync', { connection: bullConnection });

  const serverAdapter = new FastifyAdapter();

  createBullBoard({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queues: [
      new BullMQAdapter(mensajeSalienteQueue) as any,
      new BullMQAdapter(campanaQueue) as any,
      new BullMQAdapter(imapSyncQueue) as any,
    ],
    serverAdapter,
  });

  serverAdapter.setBasePath('/admin/queues');

  // Basic auth for Bull Board
  await fastify.register(async (app) => {
    app.addHook('preHandler', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Basic ')) {
        return reply
          .code(401)
          .header('WWW-Authenticate', 'Basic realm="Bull Board"')
          .send('Unauthorized');
      }

      const base64 = authHeader.split(' ')[1];
      const [user, pass] = Buffer.from(base64, 'base64').toString().split(':');

      if (user !== config.BULL_BOARD_USER || pass !== config.BULL_BOARD_PASS) {
        return reply.code(401).send('Unauthorized');
      }
    });

    await app.register(serverAdapter.registerPlugin(), {
      prefix: '/admin/queues',
      basePath: '/admin/queues',
    });
  });

  // ─── API ROUTES ──────────────────────────────────────────────────
  await fastify.register(authPlugin, { prefix: '/api/auth' });
  await fastify.register(leadsPlugin, { prefix: '/api/leads' });
  await fastify.register(mensajesPlugin, { prefix: '/api/leads' });
  await fastify.register(cotizacionesPlugin, { prefix: '/api/cotizaciones' });
  await fastify.register(kpisPlugin, { prefix: '/api/kpis' });
  await fastify.register(dashboardPlugin, { prefix: '/api/dashboard' });
  await fastify.register(canalesPlugin, { prefix: '/api/canales' });
  await fastify.register(asignacionPlugin, { prefix: '/api/asignacion' });
  await fastify.register(mediaPlugin, { prefix: '/api/media' });

  // ─── WEBHOOK (PUBLIC, NO JWT) ────────────────────────────────────
  await fastify.register(webhookWaPlugin, { prefix: '/webhook/wa' });

  // ─── WEBSOCKET ENDPOINT ──────────────────────────────────────────
  fastify.register(async (app) => {
    app.get(
      '/ws',
      { websocket: true },
      async (connection, request) => {
        const ws = connection.socket;

        // Authenticate via query param token
        const token = (request.query as { token?: string }).token;

        if (!token) {
          ws.close(4001, 'No token provided');
          return;
        }

        let user: { id: string; nombre: string; rol: string };
        try {
          user = fastify.jwt.verify(token) as typeof user;
        } catch {
          ws.close(4001, 'Invalid token');
          return;
        }

        await wsHub.onConnect(ws as unknown as WebSocket, user.id);

        ws.on('message', (raw) => {
          try {
            const data = JSON.parse(raw.toString()) as { type: string };
            if (data.type === 'ping') {
              ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
            }
          } catch {
            // ignore malformed messages
          }
        });
      }
    );
  });

  // ─── ERROR HANDLER ───────────────────────────────────────────────
  fastify.setErrorHandler((error, _request, reply) => {
    fastify.log.error(error);

    if (error.validation) {
      return reply.code(422).send({
        error: 'Validation error',
        details: error.validation,
      });
    }

    if (error.statusCode === 429) {
      return reply.code(429).send({
        error: 'Too many requests',
        message: 'Rate limit exceeded',
      });
    }

    const statusCode = error.statusCode ?? 500;
    return reply.code(statusCode).send({
      error: statusCode === 500 ? 'Internal server error' : error.message,
    });
  });

  // ─── NOT FOUND ───────────────────────────────────────────────────
  fastify.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({ error: 'Route not found' });
  });

  return fastify;
}

async function start(): Promise<void> {
  const app = await buildApp();

  // Heartbeat for WebSocket connections
  const heartbeatInterval = wsHub.startHeartbeat(30000);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[App] Received ${signal}. Starting graceful shutdown...`);

    clearInterval(heartbeatInterval);

    await app.close();
    await wsHub.destroy();
    await closePool();

    console.log('[App] Graceful shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    console.error('[App] Uncaught exception:', err);
    shutdown('uncaughtException').catch(console.error);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[App] Unhandled rejection:', reason);
  });

  try {
    await app.listen({
      port: config.PORT,
      host: '0.0.0.0',
    });

    console.log(`
╔══════════════════════════════════════════════╗
║     Electrica Ventas CRM API                 ║
║     Server running on port ${config.PORT}              ║
║     Environment: ${config.NODE_ENV.padEnd(26)}║
╚══════════════════════════════════════════════╝
    `);

    console.log(`[App] Health check: http://localhost:${config.PORT}/health`);
    console.log(`[App] Bull Board:   http://localhost:${config.PORT}/admin/queues`);
    console.log(`[App] WebSocket:    ws://localhost:${config.PORT}/ws`);
  } catch (err) {
    console.error('[App] Failed to start server:', err);
    process.exit(1);
  }
}

// Start the application
start().catch((err) => {
  console.error('[App] Startup error:', err);
  process.exit(1);
});

export { buildApp };
