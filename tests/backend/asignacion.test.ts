import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { buildApp } from '../../backend/src/app'
import { setupTestDb, cleanupTestDb, teardownTestDb, TEST_GERENTE, TEST_CANAL } from './setup'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let authToken: string

beforeAll(async () => {
  await setupTestDb()
  app = await buildApp()

  const loginRes = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { email: TEST_GERENTE.email, password: TEST_GERENTE.password },
  })
  authToken = loginRes.json<{ accessToken: string }>().accessToken
})

afterAll(async () => {
  await app.close()
  await teardownTestDb()
})

beforeEach(async () => {
  await cleanupTestDb()
  await setupTestDb()
  const loginRes = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { email: TEST_GERENTE.email, password: TEST_GERENTE.password },
  })
  authToken = loginRes.json<{ accessToken: string }>().accessToken
})

describe('Reglas de asignación', () => {
  it('GET /api/asignacion/reglas devuelve reglas por canal', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/asignacion/reglas',
      headers: { Authorization: `Bearer ${authToken}` },
    })
    expect(res.statusCode).toBe(200)
    const rules = res.json<Array<{ canal_id: string; modo: string }>>()
    expect(Array.isArray(rules)).toBe(true)
  })

  it('PUT /api/asignacion/reglas/:canalId cambia modo', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/asignacion/reglas/${TEST_CANAL.id}`,
      headers: { Authorization: `Bearer ${authToken}` },
      payload: { modo: 'carga' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ modo: string }>().modo).toBe('carga')
  })
})

describe('Auto-asignación', () => {
  it('POST /api/asignacion/auto con leads nuevos devuelve asignados > 0', async () => {
    const { pool } = await import('./setup')

    // Insert 3 unassigned leads
    for (let i = 0; i < 3; i++) {
      await pool.query(
        `INSERT INTO leads (contacto, telefono, canal_id, etapa) VALUES ($1, $2, $3, 'nuevo')`,
        [`Lead Test ${i}`, `+5281000${i}000`, TEST_CANAL.id]
      )
    }

    const res = await app.inject({
      method: 'POST', url: '/api/asignacion/auto',
      headers: { Authorization: `Bearer ${authToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ asignados: number }>().asignados).toBeGreaterThan(0)
  })
})
