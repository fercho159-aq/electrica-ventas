// =============================================================================
// Electrica Ventas - Configuración PM2 (VPS multi-app 31.220.109.7)
// Nombres con prefijo "electrica-" para no chocar con otras apps del VPS
// Puerto 3010 (3000 reservado por appsoluciones)
// Uso: pm2 start devops/pm2.config.js --env production
// =============================================================================

const path = require('path');
// Ruta del backend derivada de la ubicación de este archivo: funciona igual en
// /opt/electrica-ventas, /var/www/electrica-ventas o cualquier checkout.
const BACKEND = path.join(__dirname, '..', 'backend');

module.exports = {
  apps: [
    // ── API principal (Fastify + WebSocket) ─────────────────────────────────
    {
      name: 'electrica-api',
      cwd: BACKEND,
      script: 'dist/app.js',
      instances: 1,                // fork: WebSocket no se reparte bien en cluster sin sticky sessions
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
      log_file: '/var/log/electrica/pm2-api.log',
      error_file: '/var/log/electrica/pm2-api-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3010,
      },
    },

    // ── Worker: mensajes salientes (WhatsApp / SMTP) ────────────────────────
    {
      name: 'electrica-worker-mensajes',
      cwd: BACKEND,
      script: 'dist/workers/mensaje-saliente.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '300M',
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s',
      log_file: '/var/log/electrica/pm2-worker-mensajes.log',
      error_file: '/var/log/electrica/pm2-worker-mensajes-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env_production: { NODE_ENV: 'production' },
    },

    // ── Worker: campañas masivas ────────────────────────────────────────────
    {
      name: 'electrica-worker-campanas',
      cwd: BACKEND,
      script: 'dist/workers/campana.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '300M',
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s',
      log_file: '/var/log/electrica/pm2-worker-campanas.log',
      error_file: '/var/log/electrica/pm2-worker-campanas-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env_production: { NODE_ENV: 'production' },
    },

    // ── Worker: recordatorios de seguimiento (TODO item 14) ─────────────────
    // Cron por intervalo: avisa al vendedor de cotizaciones sin respuesta.
    {
      name: 'electrica-worker-recordatorios',
      cwd: BACKEND,
      script: 'dist/workers/recordatorios.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '200M',
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s',
      log_file: '/var/log/electrica/pm2-worker-recordatorios.log',
      error_file: '/var/log/electrica/pm2-worker-recordatorios-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env_production: {
        NODE_ENV: 'production',
        RECORDATORIO_DIAS: 3,
        RECORDATORIO_INTERVALO_MIN: 60,
      },
    },

    // ── Worker: sincronización IMAP (correo entrante) ───────────────────────
    // Comentado por defecto: actívalo solo cuando configures IMAP_* en .env
    // {
    //   name: 'electrica-imap-sync',
    //   cwd: BACKEND,
    //   script: 'dist/workers/imap-sync.js',
    //   instances: 1,
    //   exec_mode: 'fork',
    //   watch: false,
    //   max_memory_restart: '200M',
    //   restart_delay: 10000,
    //   max_restarts: 5,
    //   min_uptime: '15s',
    //   log_file: '/var/log/electrica/pm2-imap-sync.log',
    //   error_file: '/var/log/electrica/pm2-imap-sync-error.log',
    //   merge_logs: true,
    //   log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    //   env_production: { NODE_ENV: 'production' },
    // },
  ],
};
