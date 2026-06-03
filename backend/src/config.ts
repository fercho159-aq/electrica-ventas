import dotenv from 'dotenv';
dotenv.config();

interface Config {
  NODE_ENV: string;
  PORT: number;
  WS_PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  CORS_ORIGIN: string;
  ENCRYPTION_KEY: string;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER: string;
  SMTP_PASS: string;
  SMTP_FROM: string;
  IMAP_HOST: string;
  IMAP_PORT: number;
  IMAP_USER: string;
  IMAP_PASS: string;
  BULL_BOARD_USER: string;
  BULL_BOARD_PASS: string;
  EMPRESA_NOMBRE: string;
  EMPRESA_LOGO_URL: string;
  EMPRESA_RFC: string;
  EMPRESA_TELEFONO: string;
  EMPRESA_DIRECCION: string;
  EMPRESA_EMAIL: string;
  API_BASE_URL: string;
}

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val || val.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return val.trim();
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name]?.trim() || defaultValue;
}

function requireEnvInt(name: string): number {
  const val = requireEnv(name);
  const num = parseInt(val, 10);
  if (isNaN(num)) {
    throw new Error(`Environment variable ${name} must be an integer, got: ${val}`);
  }
  return num;
}

function optionalEnvInt(name: string, defaultValue: number): number {
  const val = process.env[name]?.trim();
  if (!val) return defaultValue;
  const num = parseInt(val, 10);
  return isNaN(num) ? defaultValue : num;
}

// Validate critical vars at startup
const criticalVars = ['DATABASE_URL', 'JWT_SECRET'];
for (const varName of criticalVars) {
  if (!process.env[varName] || process.env[varName]!.trim() === '') {
    throw new Error(
      `FATAL: Missing critical environment variable: ${varName}. ` +
      `Application cannot start without it.`
    );
  }
}

export const config: Config = {
  NODE_ENV: optionalEnv('NODE_ENV', 'development'),
  PORT: optionalEnvInt('PORT', 3000),
  WS_PORT: optionalEnvInt('WS_PORT', 3001),
  DATABASE_URL: requireEnv('DATABASE_URL'),
  REDIS_URL: optionalEnv('REDIS_URL', 'redis://localhost:6379'),
  JWT_SECRET: requireEnv('JWT_SECRET'),
  JWT_REFRESH_SECRET: optionalEnv('JWT_REFRESH_SECRET', requireEnv('JWT_SECRET') + '_refresh'),
  JWT_EXPIRES_IN: optionalEnv('JWT_EXPIRES_IN', '1h'),
  JWT_REFRESH_EXPIRES_IN: optionalEnv('JWT_REFRESH_EXPIRES_IN', '7d'),
  CORS_ORIGIN: optionalEnv('CORS_ORIGIN', 'http://localhost:5173'),
  ENCRYPTION_KEY: optionalEnv('ENCRYPTION_KEY', 'electrica-ventas-key-32chars!!!!'),
  SMTP_HOST: optionalEnv('SMTP_HOST', 'smtp.gmail.com'),
  SMTP_PORT: optionalEnvInt('SMTP_PORT', 587),
  SMTP_USER: optionalEnv('SMTP_USER', ''),
  SMTP_PASS: optionalEnv('SMTP_PASS', ''),
  SMTP_FROM: optionalEnv('SMTP_FROM', 'ventas@electrica.mx'),
  IMAP_HOST: optionalEnv('IMAP_HOST', 'imap.gmail.com'),
  IMAP_PORT: optionalEnvInt('IMAP_PORT', 993),
  IMAP_USER: optionalEnv('IMAP_USER', ''),
  IMAP_PASS: optionalEnv('IMAP_PASS', ''),
  BULL_BOARD_USER: optionalEnv('BULL_BOARD_USER', 'admin'),
  BULL_BOARD_PASS: optionalEnv('BULL_BOARD_PASS', 'admin123'),
  EMPRESA_NOMBRE: optionalEnv('EMPRESA_NOMBRE', 'Electrica Ventas S.A. de C.V.'),
  EMPRESA_LOGO_URL: optionalEnv('EMPRESA_LOGO_URL', ''),
  EMPRESA_RFC: optionalEnv('EMPRESA_RFC', 'EVI000000XXX'),
  EMPRESA_TELEFONO: optionalEnv('EMPRESA_TELEFONO', '+52 81 0000-0000'),
  EMPRESA_DIRECCION: optionalEnv('EMPRESA_DIRECCION', 'Av. Principal 100, Monterrey, N.L.'),
  EMPRESA_EMAIL: optionalEnv('EMPRESA_EMAIL', 'contacto@electrica.mx'),
  API_BASE_URL: optionalEnv('API_BASE_URL', 'http://localhost:3000'),
};
