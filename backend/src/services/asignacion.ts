import Redis from 'ioredis';
import { config } from '../config';
import { query, queryOne, queryMany } from '../db';

interface Regla {
  id: string;
  canal_id: string;
  modo: 'round_robin' | 'carga' | 'manual';
  updated_at: string;
}

interface AsignacionResult {
  leadId: string;
  vendedorId: string;
  vendedorNombre: string;
  modo: string;
}

export class AsignacionService {
  private redis: Redis;

  constructor() {
    this.redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });
  }

  async getRegla(canalId: string): Promise<Regla | null> {
    return queryOne<Regla>(
      'SELECT * FROM asignacion_reglas WHERE canal_id = $1',
      [canalId]
    );
  }

  async asignarLead(leadId: string, canalId: string): Promise<AsignacionResult | null> {
    const regla = await this.getRegla(canalId);
    if (!regla) {
      console.warn(`[Asignacion] No rule found for canal ${canalId}`);
      return null;
    }

    if (regla.modo === 'manual') {
      return null;
    }

    // Item 5: los leads marcados 'informativo' no se asignan (se atienden y cierran
    // desde la bandeja general). Sin clasificar o 'prospecto' sí se asignan.
    const lead = await queryOne<{ clasificacion: string | null }>(
      'SELECT clasificacion FROM leads WHERE id = $1',
      [leadId]
    );
    if (lead?.clasificacion === 'informativo') {
      return null;
    }

    let vendedorId: string | null = null;

    if (regla.modo === 'round_robin') {
      vendedorId = await this.roundRobin(canalId);
    } else if (regla.modo === 'carga') {
      vendedorId = await this.porCarga();
    }

    if (!vendedorId) {
      console.warn(`[Asignacion] Could not find a vendor for lead ${leadId} via ${regla.modo}`);
      return null;
    }

    await query(
      "UPDATE leads SET asignado_a = $1, ultima_interaccion = NOW(), etapa = CASE WHEN etapa = 'nuevo' THEN 'contactado' ELSE etapa END WHERE id = $2",
      [vendedorId, leadId]
    );

    await query(
      `INSERT INTO mensajes (lead_id, direccion, origen, texto, ts)
       VALUES ($1, 'saliente', 'sistema', $2, NOW())`,
      [
        leadId,
        `Lead asignado automáticamente (modo: ${regla.modo})`,
      ]
    );

    const vendedor = await queryOne<{ nombre: string }>(
      'SELECT nombre FROM usuarios WHERE id = $1',
      [vendedorId]
    );

    console.log(`[Asignacion] Lead ${leadId} assigned to vendor ${vendedorId} via ${regla.modo}`);

    return {
      leadId,
      vendedorId,
      vendedorNombre: vendedor?.nombre ?? 'Desconocido',
      modo: regla.modo,
    };
  }

  async roundRobin(canalId: string): Promise<string | null> {
    const vendedores = await queryMany<{ id: string }>(
      'SELECT id FROM usuarios WHERE activo = true AND rol = $1 ORDER BY created_at ASC',
      ['vendedor']
    );

    if (vendedores.length === 0) {
      return null;
    }

    const counterKey = `rr:canal:${canalId}`;
    const currentIndex = await this.redis.incr(counterKey);

    // Set TTL so stale counters don't persist forever (30 days)
    await this.redis.expire(counterKey, 30 * 24 * 60 * 60);

    const selectedIndex = (currentIndex - 1) % vendedores.length;
    return vendedores[selectedIndex].id;
  }

  async porCarga(): Promise<string | null> {
    const vendedor = await queryOne<{ id: string }>(
      `SELECT u.id
       FROM usuarios u
       WHERE u.activo = true AND u.rol = 'vendedor'
       ORDER BY (
         SELECT COUNT(*) FROM leads l
         WHERE l.asignado_a = u.id
           AND l.etapa NOT IN ('cerrado', 'no_cierre')
       ) ASC
       LIMIT 1`
    );

    return vendedor?.id ?? null;
  }

  async autoAsignarPendientes(canalId?: string): Promise<AsignacionResult[]> {
    let leadsQuery: string;
    let leadsParams: unknown[];

    if (canalId) {
      leadsQuery = `
        SELECT id, canal_id FROM leads
        WHERE asignado_a IS NULL
          AND etapa = 'nuevo'
          AND clasificacion IS DISTINCT FROM 'informativo'
          AND canal_id = $1
        ORDER BY created_at ASC
        LIMIT 50
      `;
      leadsParams = [canalId];
    } else {
      leadsQuery = `
        SELECT id, canal_id FROM leads
        WHERE asignado_a IS NULL
          AND etapa = 'nuevo'
          AND clasificacion IS DISTINCT FROM 'informativo'
          AND canal_id IS NOT NULL
        ORDER BY created_at ASC
        LIMIT 50
      `;
      leadsParams = [];
    }

    const leads = await queryMany<{ id: string; canal_id: string }>(leadsQuery, leadsParams);
    const results: AsignacionResult[] = [];

    for (const lead of leads) {
      try {
        const result = await this.asignarLead(lead.id, lead.canal_id);
        if (result) {
          results.push(result);
        }
      } catch (err) {
        console.error(`[Asignacion] Error assigning lead ${lead.id}:`, (err as Error).message);
      }
    }

    return results;
  }

  async cambiarModo(canalId: string, modo: 'round_robin' | 'carga' | 'manual'): Promise<Regla> {
    const existing = await this.getRegla(canalId);

    let result: Regla;

    if (existing) {
      const updated = await queryOne<Regla>(
        `UPDATE asignacion_reglas SET modo = $1, updated_at = NOW()
         WHERE canal_id = $2
         RETURNING *`,
        [modo, canalId]
      );
      result = updated!;
    } else {
      const inserted = await queryOne<Regla>(
        `INSERT INTO asignacion_reglas (canal_id, modo)
         VALUES ($1, $2)
         RETURNING *`,
        [canalId, modo]
      );
      result = inserted!;
    }

    return result;
  }

  destroy(): void {
    this.redis.disconnect();
  }
}

export const asignacionService = new AsignacionService();
