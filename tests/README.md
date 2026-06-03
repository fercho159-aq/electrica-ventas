# Tests — Electrica Ventas

## Setup

Requiere base de datos de test separada:

```bash
createdb electrica_ventas_test
export TEST_DATABASE_URL=postgresql://localhost/electrica_ventas_test
```

## Correr tests

```bash
# Unitarios + integración (Jest)
cd backend
npm run test:unit        # jest tests/backend/auth.test.ts
npm run test:integration # jest tests/backend/webhook.test.ts
npm run test:all         # jest tests/

# Seguridad
npm run test:security    # jest tests/security/

# Carga (requiere k6 instalado)
k6 run tests/load/webhook-load.js -e BASE_URL=http://localhost:3000
k6 run tests/load/api-load.js -e BASE_URL=http://localhost:3000 -e TOKEN=<jwt>
```

## Variables de entorno para tests

```bash
TEST_DATABASE_URL=postgresql://localhost/electrica_ventas_test
TEST_REDIS_URL=redis://localhost:6379/1  # DB 1 separada de producción
JWT_SECRET=test-jwt-secret-minimum-32-chars
JWT_REFRESH_SECRET=test-refresh-secret-minimum-32-chars
BULL_BOARD_USER=admin
BULL_BOARD_PASS=admin
```

## Cobertura

| Suite | Tests | Cubre |
|---|---|---|
| auth.test.ts | 7 | Login, JWT, refresh tokens |
| webhook.test.ts | 6 | HMAC, dedup, creación de leads |
| asignacion.test.ts | 3 | Reglas, auto-asignación |
| security/auth-check.test.ts | 8+ | Auth, SQL injection, rate limit |
| load/webhook-load.js | - | 14 canales × 100 msgs, p95 < 200ms |
| load/api-load.js | - | 50 VUs mixtos, p95 < 500ms |
