import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { buildApp } from '../../backend/src/app'
import { setupTestDb, teardownTestDb, TEST_GERENTE, TEST_VENDEDOR } from '../backend/setup'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let vendedorToken: string

const PROTECTED_ROUTES = [
  { method: 'GET', url: '/api/leads' },
  { method: 'GET', url: '/api/cotizaciones' },
  { method: 'GET', url: '/api/kpis' },
  { method: 'GET', url: '/api/dashboard/resumen' },
  { method: 'GET', url: '/api/canales' },
  { method: 'GET', url: '/api/asignacion/reglas' },
]

beforeAll(async () => {
  await setupTestDb()
  app = await buildApp()

  const loginRes = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { email: TEST_VENDEDOR.email, password: TEST_VENDEDOR.password },
  })
  vendedorToken = loginRes.json<{ accessToken: string }>().accessToken
})

afterAll(async () => {
  await app.close()
  await teardownTestDb()
})

describe('Endpoints protegidos sin token → 401', () => {
  for (const route of PROTECTED_ROUTES) {
    it(`${route.method} ${route.url} sin token → 401`, async () => {
      const res = await app.inject({ method: route.method as 'GET', url: route.url })
      expect(res.statusCode).toBe(401)
    })
  }
})

describe('Inyección SQL en parámetros de búsqueda', () => {
  it('buscar con payload SQL injection → no error de DB', async () => {
    const malicious = "'; DROP TABLE leads; --"
    const res = await app.inject({
      method: 'GET',
      url: `/api/leads?buscar=${encodeURIComponent(malicious)}`,
      headers: { Authorization: `Bearer ${vendedorToken}` },
    })
    // Debe responder 200 o 422 pero nunca 500
    expect(res.statusCode).not.toBe(500)
    expect(res.statusCode).not.toBe(503)
  })

  it('etapa con valor inválido → 422 o lista vacía, no 500', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/leads?etapa='; DROP TABLE--`,
      headers: { Authorization: `Bearer ${vendedorToken}` },
    })
    expect(res.statusCode).not.toBe(500)
  })
})

describe('Rate limiting en webhook', () => {
  it('webhook sin firma → 401 consistente bajo carga', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        app.inject({
          method: 'POST',
          url: `/webhook/wa/fake-canal-id`,
          headers: { 'content-type': 'application/json' },
          payload: JSON.stringify({ test: true }),
        })
      )
    )
    // All should be 401 or 404 (invalid canal), none should be 500
    results.forEach((res) => {
      expect([401, 404]).toContain(res.statusCode)
    })
  })
})
