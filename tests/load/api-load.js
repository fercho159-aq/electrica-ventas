// k6 API general load test
// Ejecutar: k6 run tests/load/api-load.js -e TOKEN=<jwt>
import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '60s', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.001'],
  },
}

const BASE_URL = __ENV.BASE_URL || 'https://api.electrica.mx'
const TOKEN = __ENV.TOKEN || ''

const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TOKEN}`,
}

export default function () {
  const roll = Math.random()

  if (roll < 0.60) {
    const res = http.get(`${BASE_URL}/api/leads?limit=20`, { headers: HEADERS })
    check(res, { 'leads 200': (r) => r.status === 200 })
  } else if (roll < 0.80) {
    const res = http.get(`${BASE_URL}/api/dashboard/resumen`, { headers: HEADERS })
    check(res, { 'dashboard 200': (r) => r.status === 200 })
  } else if (roll < 0.90) {
    const res = http.get(`${BASE_URL}/api/cotizaciones?limit=10`, { headers: HEADERS })
    check(res, { 'cotizaciones 200': (r) => r.status === 200 })
  } else {
    const res = http.get(`${BASE_URL}/api/kpis?periodo=mes`, { headers: HEADERS })
    check(res, { 'kpis 200': (r) => r.status === 200 })
  }

  sleep(0.2)
}
