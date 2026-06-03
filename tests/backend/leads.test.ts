import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { buildApp } from '../../backend/src/app'
import { setupTestDb, cleanupTestDb, teardownTestDb, TEST_GERENTE, TEST_VENDEDOR, TEST_CANAL } from './setup'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let gerenteToken: string
let vendedorToken: string

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
  await setupTestDb()
  const gr = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: TEST_GERENTE.email, password: TEST_GERENTE.password } })
  const vr = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: TEST_VENDEDOR.email, password: TEST_VENDEDOR.password } })
  gerenteToken = gr.json<{ accessToken: string }>().accessToken
  vendedorToken = vr.json<{ accessToken: string }>().accessToken
})

describe('POST /api/leads', () => {
  it('crea lead con etapa=nuevo por defecto', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/leads',
      headers: { Authorization: `Bearer ${gerenteToken}` },
      payload: { contacto: 'Test Contacto', empresa: 'Test SA', telefono: '+5281234567', canal_id: TEST_CANAL.id },
    })
    expect(res.statusCode).toBe(201)
    const lead = res.json<{ etapa: string; id: string }>()
    expect(lead.etapa).toBe('nuevo')
    expect(lead.id).toBeTruthy()
  })
})

describe('PATCH /api/leads/:id/etapa', () => {
  it('transición nuevo→contactado persiste en DB', async () => {
    const { pool } = await import('./setup')
    const { rows: [lead] } = await pool.query(
      `INSERT INTO leads (contacto, canal_id, etapa) VALUES ('Lead A', $1, 'nuevo') RETURNING id`,
      [TEST_CANAL.id]
    )

    const res = await app.inject({
      method: 'PATCH', url: `/api/leads/${lead.id}/etapa`,
      headers: { Authorization: `Bearer ${gerenteToken}` },
      payload: { etapa: 'contactado' },
    })
    expect(res.statusCode).toBe(200)

    const { rows: [updated] } = await pool.query('SELECT etapa FROM leads WHERE id = $1', [lead.id])
    expect(updated.etapa).toBe('contactado')
  })
})

describe('GET /api/leads — filtrado por rol', () => {
  it('vendedor solo ve sus leads asignados', async () => {
    const { pool } = await import('./setup')
    await pool.query(
      `INSERT INTO leads (contacto, canal_id, etapa, asignado_a) VALUES ('Lead Vendedor', $1, 'contactado', $2)`,
      [TEST_CANAL.id, TEST_VENDEDOR.id]
    )
    await pool.query(
      `INSERT INTO leads (contacto, canal_id, etapa, asignado_a) VALUES ('Lead Otro', $1, 'nuevo', $2)`,
      [TEST_CANAL.id, TEST_GERENTE.id]
    )

    const res = await app.inject({
      method: 'GET', url: '/api/leads',
      headers: { Authorization: `Bearer ${vendedorToken}` },
    })
    expect(res.statusCode).toBe(200)
    const { data } = res.json<{ data: Array<{ asignado_a: string }> }>()
    data.forEach((l) => expect(l.asignado_a).toBe(TEST_VENDEDOR.id))
  })

  it('gerente ve todos los leads', async () => {
    const { pool } = await import('./setup')
    await pool.query(
      `INSERT INTO leads (contacto, canal_id, etapa, asignado_a) VALUES ('Lead 1', $1, 'nuevo', $2), ('Lead 2', $1, 'contactado', $3)`,
      [TEST_CANAL.id, TEST_VENDEDOR.id, TEST_GERENTE.id]
    )

    const res = await app.inject({
      method: 'GET', url: '/api/leads',
      headers: { Authorization: `Bearer ${gerenteToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ data: unknown[] }>().data.length).toBeGreaterThanOrEqual(2)
  })
})

describe('PATCH /api/leads/:id/asignar', () => {
  it('asigna vendedor y registra mensaje de sistema', async () => {
    const { pool } = await import('./setup')
    const { rows: [lead] } = await pool.query(
      `INSERT INTO leads (contacto, canal_id, etapa) VALUES ('Lead Sin Asignar', $1, 'nuevo') RETURNING id`,
      [TEST_CANAL.id]
    )

    const res = await app.inject({
      method: 'PATCH', url: `/api/leads/${lead.id}/asignar`,
      headers: { Authorization: `Bearer ${gerenteToken}` },
      payload: { vendedor_id: TEST_VENDEDOR.id },
    })
    expect(res.statusCode).toBe(200)

    const { rows: msgs } = await pool.query(
      `SELECT * FROM mensajes WHERE lead_id = $1 AND origen = 'sistema'`,
      [lead.id]
    )
    expect(msgs.length).toBeGreaterThan(0)
  })
})
