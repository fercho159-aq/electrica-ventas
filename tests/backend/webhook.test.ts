import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { createHmac } from 'crypto'
import { buildApp } from '../../backend/src/app'
import { setupTestDb, cleanupTestDb, teardownTestDb, TEST_CANAL } from './setup'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance

function makeSignature(payload: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex')
}

function makeWaPayload(from: string, msgId: string, text: string) {
  return {
    entry: [{
      changes: [{
        value: {
          messages: [{
            id: msgId,
            from,
            type: 'text',
            text: { body: text },
            timestamp: String(Math.floor(Date.now() / 1000)),
          }],
        },
      }],
    }],
  }
}

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
})

describe('POST /webhook/wa/:canalId — HMAC validation', () => {
  it('webhook con HMAC válido devuelve 200', async () => {
    const payload = JSON.stringify(makeWaPayload('+528110001234', 'msg-001', 'Hola'))
    const sig = makeSignature(payload, TEST_CANAL.webhook_secret)

    const res = await app.inject({
      method: 'POST',
      url: `/webhook/wa/${TEST_CANAL.id}`,
      headers: { 'x-hub-signature-256': sig, 'content-type': 'application/json' },
      payload,
    })
    expect(res.statusCode).toBe(200)
  })

  it('webhook con HMAC inválido devuelve 401', async () => {
    const payload = JSON.stringify(makeWaPayload('+528110001234', 'msg-002', 'Test'))
    const res = await app.inject({
      method: 'POST',
      url: `/webhook/wa/${TEST_CANAL.id}`,
      headers: { 'x-hub-signature-256': 'sha256=invalidsignature', 'content-type': 'application/json' },
      payload,
    })
    expect(res.statusCode).toBe(401)
  })

  it('webhook sin header signature devuelve 401', async () => {
    const payload = JSON.stringify(makeWaPayload('+528110001234', 'msg-003', 'Test'))
    const res = await app.inject({
      method: 'POST',
      url: `/webhook/wa/${TEST_CANAL.id}`,
      headers: { 'content-type': 'application/json' },
      payload,
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /webhook/wa/:canalId — deduplicación', () => {
  it('mismo wa_msg_id dos veces → solo 1 registro en DB', async () => {
    const { pool } = await import('./setup')
    const payload = JSON.stringify(makeWaPayload('+528110005678', 'msg-dedup-001', 'Test dedup'))
    const sig = makeSignature(payload, TEST_CANAL.webhook_secret)
    const headers = { 'x-hub-signature-256': sig, 'content-type': 'application/json' }

    const res1 = await app.inject({ method: 'POST', url: `/webhook/wa/${TEST_CANAL.id}`, headers, payload })
    const res2 = await app.inject({ method: 'POST', url: `/webhook/wa/${TEST_CANAL.id}`, headers, payload })

    expect(res1.statusCode).toBe(200)
    expect(res2.statusCode).toBe(200)

    const { rows } = await pool.query(`SELECT COUNT(*) FROM mensajes WHERE wa_msg_id = 'msg-dedup-001'`)
    expect(Number(rows[0].count)).toBe(1)
  })
})

describe('POST /webhook/wa/:canalId — creación de leads', () => {
  it('número nuevo crea lead con etapa=nuevo', async () => {
    const { pool } = await import('./setup')
    const telefono = '+528110009999'
    const payload = JSON.stringify(makeWaPayload(telefono, 'msg-new-lead-001', 'Buenas, quiero cotización'))
    const sig = makeSignature(payload, TEST_CANAL.webhook_secret)

    await app.inject({
      method: 'POST',
      url: `/webhook/wa/${TEST_CANAL.id}`,
      headers: { 'x-hub-signature-256': sig, 'content-type': 'application/json' },
      payload,
    })

    const { rows } = await pool.query(`SELECT * FROM leads WHERE telefono = $1`, [telefono])
    expect(rows.length).toBe(1)
    expect(rows[0].etapa).toBe('nuevo')
  })

  it('número ya existente NO crea lead duplicado', async () => {
    const { pool } = await import('./setup')
    const telefono = '+528110008888'
    const makePayload = (msgId: string) =>
      JSON.stringify(makeWaPayload(telefono, msgId, 'Mensaje ' + msgId))

    const payload1 = makePayload('msg-dup-lead-01')
    const payload2 = makePayload('msg-dup-lead-02')

    await app.inject({
      method: 'POST', url: `/webhook/wa/${TEST_CANAL.id}`,
      headers: { 'x-hub-signature-256': makeSignature(payload1, TEST_CANAL.webhook_secret), 'content-type': 'application/json' },
      payload: payload1,
    })
    await app.inject({
      method: 'POST', url: `/webhook/wa/${TEST_CANAL.id}`,
      headers: { 'x-hub-signature-256': makeSignature(payload2, TEST_CANAL.webhook_secret), 'content-type': 'application/json' },
      payload: payload2,
    })

    const { rows } = await pool.query(`SELECT COUNT(*) FROM leads WHERE telefono = $1`, [telefono])
    expect(Number(rows[0].count)).toBe(1)
  })
})
