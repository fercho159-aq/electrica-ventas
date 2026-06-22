import { runRecordatorios } from '../services/recordatorios';

/**
 * Worker de recordatorios (TODO item 14).
 * Corre periódicamente y avisa de cotizaciones sin respuesta.
 * Arrancar con: ts-node-dev src/workers/recordatorios.ts
 * Config: RECORDATORIO_DIAS (default 3), RECORDATORIO_INTERVALO_MIN (default 60).
 */
const DIAS = parseInt(process.env.RECORDATORIO_DIAS ?? '3', 10);
const INTERVALO_MIN = parseInt(process.env.RECORDATORIO_INTERVALO_MIN ?? '60', 10);

async function tick(): Promise<void> {
  try {
    const { avisados, folios } = await runRecordatorios(DIAS);
    if (avisados > 0) {
      console.log(`[Recordatorios] ${avisados} aviso(s): ${folios.join(', ')}`);
    } else {
      console.log('[Recordatorios] sin pendientes');
    }
  } catch (err) {
    console.error('[Recordatorios] error:', (err as Error).message);
  }
}

console.log(`[Recordatorios] worker activo — cada ${INTERVALO_MIN} min, umbral ${DIAS} días`);
void tick();
setInterval(() => void tick(), INTERVALO_MIN * 60 * 1000);
