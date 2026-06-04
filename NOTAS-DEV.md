# Notas de desarrollo local — Electrica Ventas

Estado y runbook para correr el sistema en local. Última actualización: 2026-06-03.

## Arquitectura: DOS frontends (¡no confundir!)

| | Prototipo (raíz) | Vite (`frontend/`) |
|---|---|---|
| Estado | **Completo y funcional** | Migración TS a medias |
| Carga | `index.html` raíz + React/Babel CDN + todos los `.jsx` | Solo `Login.tsx` migrado, resto stub |
| CSS | `styles.css` raíz (clases correctas) | clases inventadas → se ve plano |
| Servir | `python3 -m http.server 5500` → `http://localhost:5500/index.html` | `cd frontend && npm run dev` (:5173) |

**Usar el prototipo (:5500).** Ignorar Vite hasta terminar migración.

## Levantar todo en local

```bash
# 1. Infra
brew services start postgresql@16 redis

# 2. Backend API (puerto 3000)
cd backend && npm run dev

# 3. Worker de mensajes salientes (cola BullMQ)
cd backend && npm run workers

# 4. Frontend prototipo (puerto 5500)
python3 -m http.server 5500     # desde la raíz del repo

# 5. (opcional) Túnel para recibir webhooks de Meta en local
cloudflared tunnel --url http://localhost:3000
```

Abrir: `http://localhost:5500/index.html`

Parar: `lsof -ti:3000,5500 | xargs kill`

## DB

- Base: `electrica_ventas` (Postgres local, usuario `fernandotrejo`).
- Migraciones en `database/migrations/` (ya aplicadas, 10+ tablas).
- Login seed: `gerencia@electrica.mx` (gerente). Vendedores: `nombre.apellido@electrica.mx`.

## WhatsApp (Meta Cloud API)

- Canal de prueba: `WA-Meta-Prueba`, Phone Number ID `1134059933127488`.
- Credenciales por canal en `canales` (token en `api_key_encrypted` texto plano; phone_number_id en `numero`).
- **Token temporal Meta caduca ~24h** → al expirar, enviar da `401 Authentication Error`. Renovar:
  ```bash
  # validar primero (code 190 = expirado)
  curl "https://graph.facebook.com/v25.0/1134059933127488?access_token=<TOKEN>"
  # actualizar
  psql -d electrica_ventas -c "UPDATE canales SET api_key_encrypted='<TOKEN>' WHERE nombre='WA-Meta-Prueba';"
  ```
- **Webhook (recibir):** Callback URL = `{tunnel}/webhook/wa/{canal_id}`, Verify token = `canales.webhook_secret`. Suscribir campo `messages`. Canal prueba: id `58c0ee61-f871-4e20-9c4d-49f86e5f5858`, secret `0d482be5cd2e7ec05c2e375d62962e19`.
- ⚠️ URL de `cloudflared` es efímera → cambia en cada arranque → reconfigurar webhook en Meta.
- Números MX: WhatsApp entrega `from` como `521XXXXXXXXXX`; la API exige enviar a `52XXXXXXXXXX`. Lo normaliza `whatsappService.normalizeRecipient()`.

### Reencolar un mensaje saliente atascado (estado=error)

```bash
psql -d electrica_ventas -c "UPDATE mensajes SET estado='pendiente', error_detalle=NULL WHERE id='<MSG_ID>';"
# script .mjs DENTRO de backend/ (en /tmp no resuelve bullmq):
#   new Queue('mensaje-saliente',{connection:{url:'redis://localhost:6379'}})
#     .add('send',{leadId,canalId,mensajeId,texto,tipo:'whatsapp',vendedorId})
```

## Tiempo real (WebSocket)

- Backend publica eventos a Redis `lead:{id}`; `WsHub` (`backend/src/ws/hub.ts`) los reenvía por WS a vendedores asignados + gerentes.
- **Bug corregido:** backend publica tipos en español (`mensaje_entrante`, `mensaje_saliente`, `etapa_changed`, `lead_assigned`) pero el front escucha en inglés (`new_message`, `lead_updated`). `WsClient._emit` en `api.js` ahora traduce vía `_aliasFor()`. Si agregas eventos backend, actualiza ese mapa.

## Conexión a backend por pantalla

Todas leen del backend y se auto-refrescan con WS vía el hook `useBackendData()` en `screens.jsx`.

- **Conectadas:** `login`, `inbox`, `dashboard` (getDashboard+getEmbudo+getKpis+getLeads), `asignación` (getLeads + getKpis + asignarLead + autoAsignar), `pipeline` (getLeads + updateEtapa en drag&drop), `cotizaciones` (getCotizaciones), `kpis` (getKpis), `remarketing` (getLeads etapa=no_cierre).
- **Acciones NO implementadas (UI presente, marcadas):**
  - Cotizaciones → "Nueva cotización": falta editor de partidas (el POST `/api/cotizaciones` exige `items[]`). No hay endpoint GET de detalle con items, por eso el modal muestra resumen.
  - Remarketing → "Re-contactar"/"Lanzar campaña": solo marca local; no envía plantilla WA todavía.
- **Mock a propósito:** `Unidades` (GPS) = roadmap Fase 2, sin backend.

## Recordatorio

Tras editar `.jsx`/`api.js`, hacer **hard reload** (Cmd+Shift+R): el browser cachea los scripts.
