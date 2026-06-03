// k6 load test — 14 canales WhatsApp simultáneos
// Ejecutar: k6 run tests/load/webhook-load.js
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Trend } from 'k6/metrics'
import { crypto } from 'k6/experimental/webcrypto'

export const options = {
  scenarios: {
    webhooks_concurrentes: {
      executor: 'constant-vus',
      vus: 14,
      duration: '60s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.001'],
    mensajes_procesados: ['count>500'],
  },
}

const mensajesProcesados = new Counter('mensajes_procesados')
const latencia = new Trend('webhook_latency_ms')

// IDs de canales (sustituir con UUIDs reales de tu DB)
const CANAL_IDS = Array.from({ length: 14 }, (_, i) =>
  `canal-${String(i + 1).padStart(2, '0')}-uuid-placeholder`
)
const WEBHOOK_SECRETS = Array.from({ length: 14 }, () => 'test-webhook-secret')
const BASE_URL = __ENV.BASE_URL || 'https://api.electrica.mx'

async function hmacSha256(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return 'sha256=' + Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default async function () {
  const vuIndex = __VU - 1
  const canalId = CANAL_IDS[vuIndex % 14]
  const secret = WEBHOOK_SECRETS[vuIndex % 14]

  const msgId = `load-test-${__VU}-${__ITER}-${Date.now()}`
  const from = `+52811${String(vuIndex).padStart(4, '0')}${String(__ITER % 9999).padStart(4, '0')}`

  const payload = JSON.stringify({
    entry: [{
      changes: [{
        value: {
          messages: [{
            id: msgId,
            from,
            type: 'text',
            text: { body: `Mensaje de prueba de carga ${__ITER}` },
            timestamp: String(Math.floor(Date.now() / 1000)),
          }],
        },
      }],
    }],
  })

  const signature = await hmacSha256(secret, payload)

  const start = Date.now()
  const res = http.post(
    `${BASE_URL}/webhook/wa/${canalId}`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': signature,
      },
      timeout: '5s',
    }
  )
  const elapsed = Date.now() - start

  latencia.add(elapsed)

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'latencia < 500ms': () => elapsed < 500,
  })

  if (ok) mensajesProcesados.add(1)

  sleep(0.1)
}
