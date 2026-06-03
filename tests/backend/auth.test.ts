import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { buildApp } from '../../backend/src/app'
import { setupTestDb, cleanupTestDb, teardownTestDb, TEST_GERENTE, TEST_VENDEDOR } from './setup'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance

beforeAll(async () => {
  await setupTestDb()
  app = await buildApp()
})

afterAll(async () => {
  await app.close()
  await teardownTestDb()
})

beforeEach(async () => {
  await cleanupTestDb()
  // Re-insert test users after truncate
  const { setupTestDb: reinsert } = await import('./setup')
  await reinsert()
})

describe('POST /api/auth/login', () => {
  it('login con credenciales correctas devuelve JWT y refreshToken', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_GERENTE.email, password: TEST_GERENTE.password },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ accessToken: string; refreshToken: string; user: { rol: string } }>()
    expect(body.accessToken).toBeTruthy()
    expect(body.refreshToken).toBeTruthy()
    expect(body.user.rol).toBe('gerente')
  })

  it('login con password incorrecta devuelve 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_GERENTE.email, password: 'wrong' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('login con email inexistente devuelve 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'noexiste@test.mx', password: TEST_GERENTE.password },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('Rutas protegidas con JWT', () => {
  it('GET /api/leads sin token devuelve 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/leads' })
    expect(res.statusCode).toBe(401)
  })

  it('GET /api/dashboard/resumen sin token devuelve 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/dashboard/resumen' })
    expect(res.statusCode).toBe(401)
  })

  it('JWT válido permite acceso a ruta protegida', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_GERENTE.email, password: TEST_GERENTE.password },
    })
    const { accessToken } = loginRes.json<{ accessToken: string }>()

    const res = await app.inject({
      method: 'GET',
      url: '/api/leads',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('token malformado devuelve 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/leads',
      headers: { Authorization: 'Bearer invalidtoken123' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/auth/refresh', () => {
  it('refresh token válido devuelve nuevo accessToken', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_VENDEDOR.email, password: TEST_VENDEDOR.password },
    })
    const { refreshToken } = loginRes.json<{ refreshToken: string }>()

    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken },
    })
    expect(refreshRes.statusCode).toBe(200)
    expect(refreshRes.json<{ accessToken: string }>().accessToken).toBeTruthy()
  })

  it('refresh token inválido devuelve 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: 'invalid-refresh-token' },
    })
    expect(res.statusCode).toBe(401)
  })
})
