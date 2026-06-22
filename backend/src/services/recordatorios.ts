import { query, queryMany } from '../db';
import { wsHub } from '../ws/hub';

/**
 * Recordatorios de seguimiento (TODO item 14).
 * Busca cotizaciones enviadas/vistas que llevan >= `dias` sin respuesta del cliente
 * y sin recordatorio previo, avisa al vendedor (mensaje de sistema + WS) y marca
 * la cotización para no repetir el aviso.
 */
export async function runRecordatorios(dias = 3): Promise<{ avisados: number; folios: string[] }> {
  const pendientes = await queryMany<{
    id: string;
    folio: string;
    lead_id: string;
    vendedor_id: string | null;
    dias_sin_respuesta: number;
  }>(
    `SELECT cot.id, cot.folio, cot.lead_id, cot.vendedor_id,
            FLOOR(EXTRACT(EPOCH FROM (NOW() - cot.created_at)) / 86400)::int AS dias_sin_respuesta
     FROM cotizaciones cot
     WHERE cot.estado IN ('enviada', 'vista')
       AND cot.recordatorio_enviado_at IS NULL
       AND cot.created_at < NOW() - ($1 || ' days')::interval
       -- el cliente no ha respondido tras enviarse la cotización
       AND NOT EXISTS (
         SELECT 1 FROM mensajes m
         WHERE m.lead_id = cot.lead_id
           AND m.direccion = 'entrante'
           AND m.ts > cot.created_at
       )`,
    [dias]
  );

  const folios: string[] = [];
  for (const cot of pendientes) {
    await query(
      `INSERT INTO mensajes (lead_id, direccion, origen, usuario_id, texto, ts)
       VALUES ($1, 'saliente', 'sistema', $2, $3, NOW())`,
      [
        cot.lead_id,
        cot.vendedor_id,
        `⏰ Recordatorio: la cotización ${cot.folio} lleva ${cot.dias_sin_respuesta} días sin respuesta. Da seguimiento.`,
      ]
    );

    await query(
      'UPDATE cotizaciones SET recordatorio_enviado_at = NOW() WHERE id = $1',
      [cot.id]
    );

    wsHub.broadcast(cot.lead_id, {
      type: 'recordatorio_cotizacion',
      leadId: cot.lead_id,
      cotizacionId: cot.id,
      folio: cot.folio,
      diasSinRespuesta: cot.dias_sin_respuesta,
      timestamp: new Date().toISOString(),
    });

    folios.push(cot.folio);
  }

  return { avisados: pendientes.length, folios };
}
