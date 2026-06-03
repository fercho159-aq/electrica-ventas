import { Pool } from 'pg'
import { readFileSync } from 'fs'
import { join } from 'path'
import bcrypt from 'bcrypt'

export let pool: Pool
export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://localhost/electrica_ventas_test'

export const TEST_GERENTE = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'gerente@test.mx',
  password: 'Test2024!',
  nombre: 'Gerente Test',
  rol: 'gerente' as const,
}

export const TEST_VENDEDOR = {
  id: '00000000-0000-0000-0000-000000000002',
  email: 'vendedor@test.mx',
  password: 'Vendedor2024!',
  nombre: 'Vendedor Test',
  rol: 'vendedor' as const,
}

export const TEST_CANAL = {
  id: '00000000-0000-0000-0000-000000000010',
  tipo: 'whatsapp',
  nombre: 'WA-Test-01',
  numero: '+52 81 0000 0001',
  webhook_secret: 'test-secret-123',
}

export async function setupTestDb(): Promise<void> {
  pool = new Pool({ connectionString: TEST_DB })

  // Run migrations
  const migrations = ['001_initial.sql', '002_indices.sql']
  for (const file of migrations) {
    const sql = readFileSync(join(__dirname, '../../database/migrations', file), 'utf-8')
    await pool.query(sql)
  }

  // Insert test users
  const gerenteHash = await bcrypt.hash(TEST_GERENTE.password, 10)
  const vendedorHash = await bcrypt.hash(TEST_VENDEDOR.password, 10)

  await pool.query(
    `INSERT INTO usuarios (id, nombre, email, password_hash, rol) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
    [TEST_GERENTE.id, TEST_GERENTE.nombre, TEST_GERENTE.email, gerenteHash, TEST_GERENTE.rol]
  )
  await pool.query(
    `INSERT INTO usuarios (id, nombre, email, password_hash, rol) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
    [TEST_VENDEDOR.id, TEST_VENDEDOR.nombre, TEST_VENDEDOR.email, vendedorHash, TEST_VENDEDOR.rol]
  )

  // Insert test canal
  await pool.query(
    `INSERT INTO canales (id, tipo, nombre, numero, webhook_secret) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
    [TEST_CANAL.id, TEST_CANAL.tipo, TEST_CANAL.nombre, TEST_CANAL.numero, TEST_CANAL.webhook_secret]
  )

  // Insert asignacion regla for test canal
  await pool.query(
    `INSERT INTO asignacion_reglas (canal_id, modo) VALUES ($1, 'round_robin') ON CONFLICT DO NOTHING`,
    [TEST_CANAL.id]
  )
}

export async function cleanupTestDb(): Promise<void> {
  await pool.query('TRUNCATE cotizacion_items, cotizaciones, mensajes, leads, asignacion_reglas, campanas, plantillas_wa, canales, usuarios RESTART IDENTITY CASCADE')
}

export async function teardownTestDb(): Promise<void> {
  await pool.end()
}
