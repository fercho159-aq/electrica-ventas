# Electrica Ventas — Plan de Tareas por Agente

Estado: `[ ]` pendiente · `[x]` hecho · `[~]` en progreso

> Orden recomendado: DevOps → DBA → Backend → Frontend → QA → Texter

---

## Agente 1 — DevOps / Infraestructura

### VPS Setup
- [ ] **DO-01** Aprovisionar VPS Hetzner CX32 (4vCPU, 8GB RAM, 80GB SSD)
- [ ] **DO-02** Instalar Ubuntu 22.04 LTS, configurar usuario no-root con sudo
- [ ] **DO-03** Configurar firewall UFW (puertos 22, 80, 443, + 3000/3001 solo loopback)
- [ ] **DO-04** Instalar Node.js 20 via nvm
- [ ] **DO-05** Instalar PostgreSQL 16
- [ ] **DO-06** Instalar Redis 7
- [ ] **DO-07** Instalar PM2 (gestión de procesos Node.js)

### Nginx + SSL
- [ ] **DO-08** Instalar Nginx
- [ ] **DO-09** Configurar virtual host: `api.electrica.mx` → proxy a Fastify `:3000`
- [ ] **DO-10** Configurar proxy WebSocket: `wss://api.electrica.mx/ws` → `:3001`
- [ ] **DO-11** Instalar Certbot + obtener certificado Let's Encrypt para `api.electrica.mx`
- [ ] **DO-12** Configurar auto-renovación SSL con cron

### Seguridad y variables
- [ ] **DO-13** Crear archivo `/etc/electrica/.env` con permisos 600
- [ ] **DO-14** Inyectar las 14 API keys de 360dialog como `WA_API_KEY_LINEA_01` … `WA_API_KEY_LINEA_14`
- [ ] **DO-15** Configurar rate limiting en Nginx para rutas `/webhook/*` (max 100 req/s por IP)
- [ ] **DO-16** Instalar Fail2Ban para bloqueo de IPs abusivas

### Backups y monitoreo
- [ ] **DO-17** Configurar cron diario: `pg_dump electrica_ventas | gzip > /backups/YYYY-MM-DD.sql.gz`
- [ ] **DO-18** Configurar retención de backups (últimos 30 días)
- [ ] **DO-19** Registrar endpoint en UptimeRobot o Better Uptime
- [ ] **DO-20** Configurar PM2 startup para que los workers arranquen tras reboot

### CI/CD (opcional, fase 2)
- [ ] **DO-21** GitHub Action: push a `main` → SSH deploy + `pm2 reload all`

---

## Agente 2 — DBA / Base de Datos

### Setup inicial
- [ ] **DB-01** Crear base de datos: `CREATE DATABASE electrica_ventas;`
- [ ] **DB-02** Crear usuario de app con permisos limitados (no superuser)
- [ ] **DB-03** Habilitar extensión `uuid-ossp` o usar `gen_random_uuid()` nativo (PG 14+)
- [ ] **DB-04** Crear schema de migraciones (tabla `_migrations` para versionado)

### Tablas core
- [ ] **DB-05** Crear tabla `usuarios` (id, nombre, email, password_hash, rol, zona, activo)
- [ ] **DB-06** Crear tabla `canales` (id, tipo, nombre, numero, api_key_encrypted, activo)
- [ ] **DB-07** Insertar los 14 registros de canales WhatsApp + canales de email
- [ ] **DB-08** Crear tabla `leads` (ver schema en ARQUITECTURA-PRODUCCION.md)
- [ ] **DB-09** Crear tabla `mensajes` con campo `wa_msg_id TEXT UNIQUE` para dedup
- [ ] **DB-10** Crear tabla `productos`
- [ ] **DB-11** Crear tabla `cotizaciones`
- [ ] **DB-12** Crear tabla `cotizacion_items`

### Índices
- [ ] **DB-13** `CREATE INDEX idx_leads_etapa ON leads(etapa)`
- [ ] **DB-14** `CREATE INDEX idx_leads_asignado ON leads(asignado_a)`
- [ ] **DB-15** `CREATE INDEX idx_leads_canal ON leads(canal_id)`
- [ ] **DB-16** `CREATE INDEX idx_mensajes_lead ON mensajes(lead_id, ts DESC)`
- [ ] **DB-17** `CREATE INDEX idx_mensajes_wa_id ON mensajes(wa_msg_id)` — crítico para dedup
- [ ] **DB-18** `CREATE INDEX idx_cotizaciones_lead ON cotizaciones(lead_id)`

### Tablas auxiliares
- [ ] **DB-19** Crear tabla `asignacion_reglas` (tipo: round_robin/carga/manual, activo_por_canal)
- [ ] **DB-20** Crear tabla `plantillas_wa` (id, nombre, contenido, estado_meta, canal_id)
- [ ] **DB-21** Crear tabla `campanas` (id, nombre, tipo, estado, leads_objetivo[], created_at)

### Seed data
- [ ] **DB-22** Script seed: insertar los 11 vendedores del prototipo actual
- [ ] **DB-23** Script seed: insertar catálogo de productos (15 productos del prototipo)
- [ ] **DB-24** Script seed: usuario gerente por defecto

### Encriptación
- [ ] **DB-25** Definir estrategia para `api_key_encrypted` en tabla canales (pgcrypto AES-256 o encriptación en capa de app)

---

## Agente 3 — Backend

### Proyecto base
- [ ] **BE-01** `npm init` en carpeta `backend/`, instalar Fastify, TypeScript, ts-node
- [ ] **BE-02** Instalar dependencias: `fastify`, `@fastify/jwt`, `@fastify/websocket`, `@fastify/cors`, `@fastify/rate-limit`, `pg`, `ioredis`, `bullmq`, `bcrypt`, `nodemailer`, `imap`, `pdfkit`, `dotenv`
- [ ] **BE-03** Configurar `tsconfig.json` y estructura de carpetas (routes/services/workers/db/ws)

### Auth
- [ ] **BE-04** Ruta `POST /auth/login` — validar email+password, devolver JWT (1h) + refresh token (7d)
- [ ] **BE-05** Ruta `POST /auth/logout` — invalidar refresh token en Redis
- [ ] **BE-06** Middleware de autenticación JWT para todas las rutas protegidas
- [ ] **BE-07** Ruta `POST /auth/refresh` — renovar access token con refresh token válido

### Leads
- [ ] **BE-08** `GET /leads` — filtros: etapa, asignado, canal, prioridad, página/cursor
- [ ] **BE-09** `POST /leads` — crear lead manual
- [ ] **BE-10** `PATCH /leads/:id` — actualizar campos (notas, prioridad, zona)
- [ ] **BE-11** `PATCH /leads/:id/etapa` — mover etapa + registrar evento en trazabilidad
- [ ] **BE-12** `PATCH /leads/:id/asignar` — asignar/reasignar vendedor

### Mensajes
- [ ] **BE-13** `GET /leads/:id/mensajes` — historial paginado
- [ ] **BE-14** `POST /leads/:id/mensajes` — enviar mensaje (WA o email según canal)
- [ ] **BE-15** Servicio `whatsapp.ts` — cliente 360dialog: enviar texto, imagen, documento
- [ ] **BE-16** Validación HMAC-SHA256 del header `D360-Signature` en cada webhook

### Webhook WhatsApp (crítico)
- [ ] **BE-17** `POST /webhook/wa/:canalId` — recibir mensajes entrantes (público, no requiere JWT)
- [ ] **BE-18** Message Router: identificar número del remitente, buscar lead existente o crear nuevo
- [ ] **BE-19** Auto-asignación al recibir lead nuevo (aplicar regla activa del canal)
- [ ] **BE-20** Dedup: verificar `wa_msg_id` antes de insertar mensaje
- [ ] **BE-21** Publicar evento en Redis `PUBLISH lead:{leadId} {mensaje}` al guardar mensaje

### WebSocket / Tiempo real
- [ ] **BE-22** Endpoint `ws://api.../ws` con auth JWT en query param
- [ ] **BE-23** Al conectar: suscribir al vendedor a sus leads activos en Redis
- [ ] **BE-24** Worker Redis subscriber: escuchar canal `lead:*`, pushear a clientes WS conectados
- [ ] **BE-25** Evento de presencia: broadcast cuando vendedor se conecta/desconecta

### Cotizaciones
- [ ] **BE-26** `GET /cotizaciones` — filtros por vendedor, estado, fecha
- [ ] **BE-27** `POST /cotizaciones` — crear cotización con items
- [ ] **BE-28** `GET /cotizaciones/:id/pdf` — generar PDF con PDFKit (datos empresa, items, total, folio)
- [ ] **BE-29** `POST /cotizaciones/:id/enviar` — enviar PDF por WA o email

### KPIs y Dashboard
- [ ] **BE-30** `GET /dashboard/resumen` — KPIs para el gerente (leads nuevos, tasa conversión, resp. promedio, ingresos MTD)
- [ ] **BE-31** `GET /kpis` — métricas por vendedor (mensajes, respMin, cotiz, cerradas, ingresos, tasa)
- [ ] **BE-32** `GET /canales/actividad` — mensajes últimas 24h por canal

### Asignación
- [ ] **BE-33** `GET /asignacion/reglas` — obtener regla activa por canal
- [ ] **BE-34** `PUT /asignacion/reglas/:canalId` — cambiar modo (round_robin/carga/manual)
- [ ] **BE-35** `POST /asignacion/auto` — distribuir leads nuevos según regla activa

### Email
- [ ] **BE-36** Servicio IMAP polling (cada 2 min): leer emails en ventas@, crear/actualizar leads
- [ ] **BE-37** Servicio SMTP: enviar emails con Nodemailer
- [ ] **BE-38** Asociar email entrante a lead existente por From: address

### BullMQ Workers
- [ ] **BE-39** Queue `mensaje-saliente` — procesar envíos con retry automático (3 intentos)
- [ ] **BE-40** Queue `campana-remarketing` — envío bulk a N leads con delay entre mensajes (anti-spam)
- [ ] **BE-41** Worker `imap-sync` — job recurrente de polling de email
- [ ] **BE-42** Dashboard de queues (Bull Board) en ruta `/admin/queues` con auth

---

## Agente 4 — Frontend

### Migración a Vite
- [ ] **FE-01** Crear proyecto Vite + React 18 en carpeta `frontend/`
- [ ] **FE-02** Migrar `styles.css` sin cambios (ya funciona)
- [ ] **FE-03** Convertir archivos `.jsx` a módulos ES (quitar `Object.assign(window, ...)` y usar exports)
- [ ] **FE-04** Configurar `vite.config.ts` con proxy `/api` → VPS en dev
- [ ] **FE-05** Configurar `vercel.json` para SPA routing (rewrite `/*` → `index.html`)

### Auth real
- [ ] **FE-06** Reemplazar `TweaksPanel` de login por formulario email/password real
- [ ] **FE-07** Servicio `auth.ts`: login, logout, refresh token silencioso
- [ ] **FE-08** Interceptor HTTP: adjuntar JWT en `Authorization: Bearer` a todas las requests
- [ ] **FE-09** Manejo de 401: redirect a login automático

### Capa de datos (sustituir mock)
- [ ] **FE-10** Crear hooks: `useLeads(filters)`, `useLead(id)`, `useKpis()`, `useDashboard()`
- [ ] **FE-11** Crear hook `useCotizaciones(filters)`
- [ ] **FE-12** Eliminar `data.jsx` mock una vez todos los hooks estén operativos
- [ ] **FE-13** Paginación/cursor en la lista del inbox

### WebSocket
- [ ] **FE-14** Hook `useInboxWS()` — conectar al WS, reconexión automática con backoff
- [ ] **FE-15** Al recibir evento `new_message`: insertar mensaje en conversación abierta
- [ ] **FE-16** Al recibir evento `new_lead`: incrementar badge en sidebar + notif toast
- [ ] **FE-17** Indicador de conexión WS en TopBar (dot verde/rojo)

### Inbox multicanal
- [ ] **FE-18** Añadir filtro por línea de WhatsApp (selector de los 14 canales)
- [ ] **FE-19** Mostrar en `ChipCanal` el nombre de la línea además del ícono
- [ ] **FE-20** Enviar mensaje: llamar `POST /leads/:id/mensajes` y optimistic update en UI

### Cotizaciones
- [ ] **FE-21** Botón "Descargar PDF" → fetch `/cotizaciones/:id/pdf` como blob y abrir en tab
- [ ] **FE-22** Botón "Reenviar" → llamar `POST /cotizaciones/:id/enviar`

### Ajustes menores
- [ ] **FE-23** Reemplazar `tweaks-panel.jsx` (modo dev) con configuración real de usuario
- [ ] **FE-24** Formulario "Nuevo lead" conectado a `POST /leads`
- [ ] **FE-25** Asignación: guardar cambios vía `PATCH /leads/:id/asignar`

---

## Agente 5 — QA

### Tests unitarios
- [ ] **QA-01** Configurar Vitest en frontend y Jest en backend
- [ ] **QA-02** Test: dedup de mensajes — insertar mismo `wa_msg_id` dos veces → solo 1 registro
- [ ] **QA-03** Test: algoritmo round-robin distribuye N leads entre M vendedores activos de forma equitativa
- [ ] **QA-04** Test: algoritmo "por carga" asigna siempre al vendedor con menor `cargaActual`
- [ ] **QA-05** Test: validación HMAC-SHA256 en webhook — request sin firma → 401

### Tests de integración
- [ ] **QA-06** Test: flujo completo de lead — webhook WA → lead creado → asignado → mensaje en DB
- [ ] **QA-07** Test: generación de PDF — cotización con 3 items → PDF tiene los montos correctos
- [ ] **QA-08** Test: JWT expirado → endpoint devuelve 401 → refresh → nuevo token → retry exitoso
- [ ] **QA-09** Test: WebSocket → servidor publica mensaje → cliente lo recibe < 500ms

### Tests de carga
- [ ] **QA-10** Script k6 o Artillery: simular 14 webhooks simultáneos (1 por línea) enviando 10 mensajes/s → VPS sin drops
- [ ] **QA-11** Test de cola BullMQ: 500 mensajes en cola → todos procesados en orden, sin duplicados
- [ ] **QA-12** Stress test: 50 clientes WS conectados simultáneamente → broadcast correcto

### Checklist de seguridad
- [ ] **QA-13** Verificar que endpoints sin JWT devuelven 401 (no datos parciales)
- [ ] **QA-14** Verificar que vendedor no puede ver leads de otro vendedor (`rol=vendedor`)
- [ ] **QA-15** Verificar rate limiting: >100 req/s al webhook → 429 sin drops de mensajes legítimos

---

## Agente 6 — Texter / Conversation Designer

### Plantillas WhatsApp (HSM) — requieren aprobación Meta
- [ ] **TX-01** Plantilla `bienvenida_nuevo_lead` — mensaje inicial cuando llega lead nuevo (inbound)
- [ ] **TX-02** Plantilla `cotizacion_enviada` — notificación de que se envió cotización
- [ ] **TX-03** Plantilla `seguimiento_24h` — seguimiento si no hay respuesta en 24h
- [ ] **TX-04** Plantilla `remarketing_precio` — campaña para leads no cerrados por precio
- [ ] **TX-05** Plantilla `remarketing_entrega` — campaña para leads no cerrados por tiempo de entrega
- [ ] **TX-06** Plantilla `remarketing_competencia` — oferta match de precio vs competencia
- [ ] **TX-07** Plantilla `remarketing_presupuesto` — opción de financiamiento a 60 días
- [ ] **TX-08** Plantilla `fuera_horario` — respuesta automática fuera de 8am–7pm
- [ ] **TX-09** Plantilla `asignacion_vendedor` — "Tu vendedor asignado es {{nombre}}"

> Todas las plantillas deben tener: nombre en snake_case, categoría (UTILITY/MARKETING), idioma (es_MX), parámetros con doble corchete `{{1}}`.

### Mensajes del sistema (bot, sin aprobación)
- [ ] **TX-10** Mensaje de bienvenida en ventana de 24h (sesión activa) — dentro del hilo del cliente
- [ ] **TX-11** Confirmación automática al recibir una solicitud: "Recibimos tu mensaje, en breve un especialista te atiende"
- [ ] **TX-12** Aviso de fuera de horario con horarios y opción de agendar llamada
- [ ] **TX-13** Mensaje de cierre de venta — agradecer y pedir referidos

### Diferenciación por línea
- [ ] **TX-14** Definir tono y firma por perfil de línea:
  - Líneas 1–4: Construcción (formal, técnico)
  - Líneas 5–8: Industrial / maquinaria (técnico-consultivo)
  - Líneas 9–11: Ferretería / distribuidor (ágil, precios directos)
  - Líneas 12–14: Corporativo / proyectos grandes (ejecutivo, propuestas formales)

### Emails transaccionales
- [ ] **TX-15** Template HTML email: "Cotización {{folio}}" — diseño limpio con logo, tabla de productos, total, vigencia
- [ ] **TX-16** Template HTML email: "Seguimiento de cotización" — recordatorio a 3 días de vencer
- [ ] **TX-17** Template texto plano: respaldo de todos los emails HTML

### UI Copy (frontend)
- [ ] **TX-18** Revisar todos los labels del Sidebar, TopBar y modales — consistencia en mayúsculas y terminología
- [ ] **TX-19** Placeholder texts en formularios — más descriptivos y orientados al flujo de ventas
- [ ] **TX-20** Mensajes de toast — redactar variantes para éxito, error e info en todas las acciones

---

## Orden de ejecución sugerido

```
Semana 1:  DevOps (DO-01 → DO-20) + DBA (DB-01 → DB-24)
Semana 2:  Backend Auth + Leads + Webhook WA (BE-01 → BE-21)
Semana 3:  Backend Mensajes + WS + Cotizaciones (BE-22 → BE-35)
Semana 4:  Frontend migración Vite + Auth + hooks (FE-01 → FE-13)
Semana 5:  Frontend WS + inbox multicanal (FE-14 → FE-25)
Semana 6:  QA + Texter en paralelo con Frontend
```

**Total tareas: 130**
- DevOps: 21
- DBA: 25
- Backend: 42
- Frontend: 25
- QA: 15
- Texter: 20 (2 pueden hacerse antes de tener el sistema listo)
