# TODO — CRM Eléctrica San Miguel

Tareas derivadas de `Respuestas_Dudas_CRM_ElectricaSanMiguel.pdf` (MAW Soluciones, 16 jun 2026).
Resueltas el 2026-06-17. Migración DB: `database/migrations/005_nucleo_datos.sql`.

> Nota: fórmulas y catálogos son configurables — punto de partida, se ajustan con el cliente.

---

## 🟢 Semana 1 — Quick wins
- [x] **1. Caja de respuesta que crece + `Shift+Enter`** — textarea autocrece (máx 120px), Enter envía, Shift+Enter salto. `inbox.jsx`.
- [x] **2. Nota editable + autoguardado** — pestaña Notas con textarea + autosave (debounce 800ms) vía `PATCH /api/leads/:id`. `inbox.jsx` NotasTab.
- [x] **3. Quitar botón "Cotizar" → modal `Cotización / Otro`** — botón "Registrar" abre modal con pestañas Cotización (monto+vigencia+envío) / Otro (nota). `inbox.jsx` RegistrarModal.
- [x] **4. Catálogo de botones de motivos de no cierre** — modal con catálogo configurable (`MOTIVOS_NO_CIERRE`); "Otro" admite nota. `inbox.jsx` NoCierreModal.

## 🟡 Semana 2-3 — Núcleo de datos
- [x] **5. Asignación con filtro** — columna `leads.clasificacion` (informativo/prospecto). Botones 1-clic en Asignación; informativos NO se auto-asignan (`services/asignacion.ts`); filtro `?clasificacion=` en `GET /api/leads`. Reclasificable.
- [x] **6. Cotización: monto + folio ligado a PDF** — `POST /api/cotizaciones` acepta vía rápida `{monto}` (sin desglose); folio + PDF on-demand. Modal "Nueva cotización" en pestaña Cotizaciones y en el lead.
- [x] **7. Pestaña Cotizaciones: PDFs abribles** — `GET /api/cotizaciones/:id` (detalle con partidas) + `cotizacionPdfUrl()` abre el PDF en pestaña. Botón PDF por fila.
- [x] **8. Pantalla de cierre** — `PATCH /api/cotizaciones/:id/cierre` (parcial/total + monto_cerrado + notas). Modal "Cerrar venta" lista cotizaciones pendientes. `inbox.jsx` CierreModal.
- [x] **9. Estado "Cerró en mostrador"** — `leads.cerrado_en_mostrador` + `ticket_mostrador`; `PATCH /api/leads/:id/mostrador`. En el mismo modal de cierre.

## 🟠 Semana 4 — Métricas
- [x] **10. Ingresos MTD** — suma cotizaciones aceptadas del mes usando `monto_cerrado` (soporta parcial), fallback a suma de partidas. `routes/dashboard.ts`. Incluye comparativo vs mes anterior (`ingresos_mtd_delta_pct`) mostrado como delta en la tarjeta del Dashboard.
- [x] **11. Tasa de conversión** — ahora basada en leads: `cerrados / total del mes × 100`. Respeta excluir-informativos. (Filtros vendedor/sucursal: ver pestaña KPIs por `periodo`.)
- [x] **12. Toggle excluir leads informativos** — `?excluir_informativos=true` en resumen/embudo; toggle en el Dashboard.

## 🔵 Fase 2 — Remarketing + correo
- [x] **13. Segmentos automáticos** — `GET /api/remarketing/segmentos[/:key]`: cotizó-no-cerró / cotización-vencida / informativo-interesado / sin-compra-60d. Tarjeta en Remarketing.
- [x] **14. Recordatorios al vendedor** — `services/recordatorios.ts` + worker `workers/recordatorios.ts` (cron por intervalo) + `POST /api/remarketing/recordatorios/run`. Marca `cotizaciones.recordatorio_enviado_at`. Arranca como proceso PM2 `electrica-worker-recordatorios` (`devops/pm2.config.js`) y en dev con `npm run worker:recordatorios`. Aviso en tiempo real vía Redis pub/sub → WS.
- [x] **15. Plantillas de seguimiento WhatsApp** — `GET /api/remarketing/plantillas` + `POST /api/remarketing/recontactar` (encola campaña). Modal de re-contacto con plantilla/canal.
- [~] **16. Bandeja unificada WhatsApp + correo** — UI ya soporta ambos canales y el worker `workers/imap-sync.ts` existe. **Pendiente sólo de configuración**: credenciales `IMAP_USER/IMAP_PASS/SMTP_USER/SMTP_PASS` en `backend/.env` (hoy vacías). Sin código nuevo requerido.
- [x] **17. Exportar segmentos para campañas FB/IG** — `GET /api/remarketing/export?segmento=` devuelve CSV; botón "CSV" por segmento.

---

## Verificación
- Backend: `tsc --noEmit` limpio; smoke test 26/26 contra Postgres vivo (login, clasificación, cotización rápida, PDF, cierre parcial, mostrador, dashboard, segmentos, CSV, recordatorios, permisos).
- Frontend: 8 `.jsx` transpilan limpio (Babel); verificado en navegador (Dashboard, Cotizaciones, Remarketing, Bandeja, modal de motivos) sin errores de consola.
- Bug latente corregido: `usuarios.telefono` no existía y rompía `GET /leads/:id` y el PDF (500).

## Dependencias clave
- #5 (clasificación) → métricas limpias (#11, #12) y segmentos (#13).
- #6 (cotización monto+folio) → MTD (#10), cierre (#8), segmentos de remarketing.
- Cadena: cliente → cotización (PDF + folio + monto) → cierre (parcial/total o mostrador).

## Hecho previo
- [x] Stickers / audio / foto en formato nativo de WhatsApp.
