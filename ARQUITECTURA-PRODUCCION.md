# Electrica Ventas — Arquitectura de Producción

## Estado actual del prototipo

El repo actual es un **frontend estático puro**: HTML + React 18 via CDN + Babel standalone en browser.
Sin backend, sin DB, sin auth real, sin integración de WhatsApp. Todo es mock determinístico en `data.jsx`.

Pantallas listas en UI:
- Dashboard gerente (KPIs, embudo, ranking vendedores)
- Bandeja unificada (inbox con detalle de lead + conversación)
- Asignación de leads (round-robin, por carga, manual)
- Pipeline Kanban (drag & drop)
- Cotizaciones
- KPIs por vendedor
- Remarketing
- Unidades GPS (roadmap, sin integrar)

---

## Stack recomendado para producción

### Frontend
- **React 18 + Vite** — migrar de CDN/Babel standalone a bundle real
- TypeScript (opcional pero recomendado)
- Tailwind CSS o mantener el `styles.css` actual
- Deploy: Vercel o Cloudflare Pages (solo static assets)

### Backend
- **Node.js 20 + Fastify** (o Express) — API REST + WebSocket
- **PostgreSQL 16** — base de datos principal
- **Redis 7** — pub/sub para mensajes en tiempo real, colas de tareas
- **BullMQ** — queue de mensajes salientes y campañas de remarketing

### Integraciones críticas
- **WhatsApp Business Platform** via BSP (ver sección WhatsApp abajo)
- **Nodemailer + IMAP** — integración de correo
- **PDFKit o Puppeteer** — generación de cotizaciones PDF
- **JWT + bcrypt** — autenticación real (reemplazar el tweak-panel actual)

---

## VPS vs Vercel — Decisión

### Vercel solo (frontend + serverless backend)

| Aspecto | Problema concreto |
|---|---|
| WebSockets | No soportado nativamente. Mensajes WhatsApp en tiempo real requieren WS persistente |
| Timeout | Funciones serverless max 30s (plan pro). Webhooks de WA con mensajes largos o campañas bulk fallan |
| 14 canales WhatsApp | Cada canal mantiene conexión activa. Serverless las rompe entre invocaciones |
| Precio | $20/mes plan pro + Fluid Compute = puede salir más caro que VPS equivalente |
| Estado de colas | BullMQ/Redis necesita proceso persistente — no aplica en serverless |

**Conclusión: Vercel solo NO es viable** para el backend de mensajería con 14 líneas WhatsApp.

---

### VPS + Vercel (recomendado)

```
┌─────────────────────────┐     ┌──────────────────────────────────┐
│  Vercel (frontend)      │     │  VPS Ubuntu 22.04                │
│                         │     │                                  │
│  React SPA              │────▶│  Fastify API  :3000              │
│  assets estáticos       │     │  WebSocket    :3001              │
│  CDN global             │     │  PostgreSQL   :5432              │
│                         │     │  Redis        :6379              │
│  $0–$20/mes             │     │  BullMQ workers                  │
└─────────────────────────┘     │  Nginx reverse proxy             │
                                │                                  │
         ┌──────────────────────│  WhatsApp Gateway (14 líneas)    │
         │                      └──────────────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│  BSP / 360dialog         │
│  14 números WA Business  │
│  Webhooks → VPS          │
└─────────────────────────┘
```

**VPS mínimo recomendado:**
- 4 vCPU / 8 GB RAM / 80 GB SSD NVMe
- Hetzner CX32: ~$12 USD/mes ✓
- DigitalOcean 4GB: ~$24 USD/mes
- Contabo 8GB: ~$10 USD/mes ✓

**Con 14 líneas WhatsApp + 11 vendedores + tráfico moderado, 8 GB RAM es suficiente.**

---

## Integración WhatsApp — 14 números

### Opciones de BSP

| BSP | Precio por número/mes | Setup | API |
|---|---|---|---|
| **360dialog** | ~$5 USD | $50 one-time por número | REST + Webhooks |
| **Twilio** | $0 + por mensaje | $0 setup | REST + Webhooks |
| **WATI** | Flat $49–$99/mes (multi-line) | Panel UI | REST |
| **Gupshup** | ~$3 USD/mes/número | Variable | REST |
| **Meta directo** | $0 plataforma + mensajes | Largo proceso verificación | Graph API |

**Recomendación: 360dialog** — precio fijo predecible, webhooks robustos, buena documentación, usado ampliamente en LATAM.

Costo estimado 14 números con 360dialog: ~$70–120 USD/mes + costo por conversación Meta ($0.0415–0.0624 USD/conv en MX).

### Arquitectura de mensajería con 14 líneas

```
                    WEBHOOK (POST /webhook/wa/{channelId})
360dialog ──────────────────────────────────────────────▶ VPS Fastify
                                                              │
                                                         ┌───▼────────────┐
                                                         │ Message Router │
                                                         │                │
                                                         │ 1. Identifica  │
                                                         │    número dest.│
                                                         │ 2. Busca lead  │
                                                         │    o crea nuevo│
                                                         │ 3. Asigna      │
                                                         │    vendedor    │
                                                         └───┬────────────┘
                                                             │
                                                     ┌───────▼──────┐
                                                     │  PostgreSQL  │
                                                     │  + Redis     │
                                                     │  pub/sub     │
                                                     └───────┬──────┘
                                                             │ WS event
                                                     ┌───────▼──────┐
                                                     │  React SPA   │
                                                     │  (inbox)     │
                                                     └──────────────┘
```

### Modelo de datos para 14 canales

```sql
-- Canales WhatsApp
CREATE TABLE canales (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo       TEXT NOT NULL,              -- 'whatsapp' | 'email'
  nombre     TEXT NOT NULL,              -- 'Línea Construcción', 'Línea Industrial', etc.
  numero     TEXT,                       -- +52 81 XXXX XXXX
  api_key    TEXT,                       -- 360dialog API key (encrypted)
  activo     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14 registros mínimo en esta tabla
-- Cada número tiene su api_key de 360dialog
-- El webhook URL por canal: https://api.tudominio.com/webhook/wa/{canal_id}
```

---

## Esquema de base de datos completo

```sql
-- Usuarios del sistema (gerentes + vendedores)
CREATE TABLE usuarios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  rol           TEXT NOT NULL CHECK (rol IN ('gerente', 'vendedor')),
  zona          TEXT,
  activo        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Canales de comunicación (WhatsApp x14 + email)
CREATE TABLE canales (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo     TEXT NOT NULL,
  nombre   TEXT NOT NULL,
  numero   TEXT,
  api_key  TEXT,
  activo   BOOLEAN DEFAULT true
);

-- Leads / clientes potenciales
CREATE TABLE leads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contacto         TEXT NOT NULL,
  empresa          TEXT,
  telefono         TEXT,
  email            TEXT,
  canal_id         UUID REFERENCES canales(id),
  etapa            TEXT NOT NULL DEFAULT 'nuevo',
  asignado_a       UUID REFERENCES usuarios(id),
  prioridad        TEXT DEFAULT 'media',
  zona             TEXT,
  monto_estimado   NUMERIC(12,2),
  motivo_no_cierre TEXT,
  notas            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  ultima_interaccion TIMESTAMPTZ DEFAULT NOW()
);

-- Mensajes de conversación
CREATE TABLE mensajes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID REFERENCES leads(id) ON DELETE CASCADE,
  canal_id    UUID REFERENCES canales(id),
  direccion   TEXT NOT NULL CHECK (direccion IN ('entrante', 'saliente')),
  origen      TEXT NOT NULL CHECK (origen IN ('cliente', 'vendedor', 'sistema', 'bot')),
  usuario_id  UUID REFERENCES usuarios(id),
  texto       TEXT,
  tipo_media  TEXT,
  media_url   TEXT,
  wa_msg_id   TEXT UNIQUE,         -- ID de WhatsApp para dedup
  ts          TIMESTAMPTZ DEFAULT NOW()
);

-- Productos del catálogo
CREATE TABLE productos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  precio      NUMERIC(10,2),
  unidad      TEXT DEFAULT 'pieza',
  activo      BOOLEAN DEFAULT true
);

-- Cotizaciones
CREATE TABLE cotizaciones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio       TEXT UNIQUE NOT NULL,  -- COT-YYYY-NNNN
  lead_id     UUID REFERENCES leads(id),
  vendedor_id UUID REFERENCES usuarios(id),
  estado      TEXT DEFAULT 'enviada',
  vigencia_dias INT DEFAULT 15,
  notas       TEXT,
  pdf_url     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE cotizacion_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id  UUID REFERENCES cotizaciones(id) ON DELETE CASCADE,
  producto_id    UUID REFERENCES productos(id),
  nombre         TEXT NOT NULL,
  cantidad       INT NOT NULL,
  precio_unitario NUMERIC(10,2) NOT NULL
);

-- Índices clave
CREATE INDEX idx_leads_etapa ON leads(etapa);
CREATE INDEX idx_leads_asignado ON leads(asignado_a);
CREATE INDEX idx_mensajes_lead ON mensajes(lead_id, ts DESC);
CREATE INDEX idx_mensajes_wa_id ON mensajes(wa_msg_id);
```

---

## API — Endpoints principales

```
POST   /auth/login
POST   /auth/logout

GET    /leads?etapa=&asignado=&canal=&page=
POST   /leads
PATCH  /leads/:id
PATCH  /leads/:id/etapa

GET    /leads/:id/mensajes
POST   /leads/:id/mensajes        (enviar mensaje WA o email)

GET    /cotizaciones?lead=&vendedor=
POST   /cotizaciones
GET    /cotizaciones/:id/pdf

GET    /vendedores
GET    /vendedores/:id/kpis

GET    /canales
POST   /webhook/wa/:canalId       (webhook 360dialog — público)

GET    /dashboard/resumen
GET    /kpis?periodo=mes
```

---

## WebSockets — Tiempo real

El inbox necesita actualizaciones en vivo cuando llega un mensaje de WhatsApp.

```
cliente WS ──── ws://api.tudominio.com/ws?token=JWT
                         │
                    Fastify WS
                         │
                    Redis pub/sub
                    canal: "lead:{leadId}"
                         │
                    Webhook WA recibe mensaje
                         │
                    Redis PUBLISH "lead:{leadId}" {mensaje}
                         │
                    Fastify pushea a todos los clientes
                    suscritos a ese lead
```

Librerías: `ws` + `ioredis` (Redis pub/sub) o `socket.io` con Redis adapter.

---

## Estructura del proyecto (backend)

```
backend/
├── src/
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── leads.ts
│   │   ├── mensajes.ts
│   │   ├── cotizaciones.ts
│   │   ├── kpis.ts
│   │   └── webhook-wa.ts
│   ├── services/
│   │   ├── whatsapp.ts       # 360dialog client
│   │   ├── email.ts          # nodemailer + IMAP
│   │   ├── pdf.ts            # generación cotizaciones
│   │   ├── asignacion.ts     # lógica round-robin / por carga
│   │   └── remarketing.ts    # campañas bulk
│   ├── workers/
│   │   ├── mensaje-saliente.ts   # BullMQ worker
│   │   └── campana.ts
│   ├── db/
│   │   ├── migrations/
│   │   └── queries/
│   ├── ws/
│   │   └── hub.ts            # WebSocket + Redis pub/sub
│   └── app.ts
├── package.json
└── .env
```

---

## Variables de entorno necesarias

```bash
# DB
DATABASE_URL=postgresql://user:pass@localhost:5432/electrica_ventas

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=<64 chars aleatorios>

# 360dialog — una por línea WhatsApp (14 total)
WA_API_KEY_LINEA_01=<key>
WA_API_KEY_LINEA_02=<key>
# ... hasta 14

# 360dialog base URL
WA_BASE_URL=https://waba.360dialog.io/v1

# Email
SMTP_HOST=smtp.tudominio.mx
SMTP_PORT=587
SMTP_USER=ventas@electrica.mx
SMTP_PASS=<password>
IMAP_HOST=imap.tudominio.mx
IMAP_USER=ventas@electrica.mx
IMAP_PASS=<password>

# App
PORT=3000
NODE_ENV=production
FRONTEND_URL=https://electrica-ventas.vercel.app
```

---

## Proceso de migración del prototipo

### Fase 1 — Backend mínimo viable (~2 semanas)
- [ ] Setup VPS + PostgreSQL + Redis + Nginx
- [ ] Fastify API con auth JWT
- [ ] CRUD de leads + mensajes
- [ ] Webhook WhatsApp 2 líneas (validar flujo completo)
- [ ] WebSocket para inbox en tiempo real
- [ ] Migrar frontend a Vite (quitar CDN/Babel standalone)

### Fase 2 — Todas las líneas WhatsApp (~1 semana)
- [ ] Registrar las 14 números en 360dialog
- [ ] Configurar webhook URL por canal en el dashboard 360dialog
- [ ] Verificar dedup de mensajes (campo `wa_msg_id`)
- [ ] UI: selector de línea en bandeja unificada
- [ ] Asignación automática configurable por línea

### Fase 3 — Features completos (~2 semanas)
- [ ] Generación de PDF para cotizaciones
- [ ] Integración email (IMAP polling + SMTP)
- [ ] Campañas de remarketing (BullMQ bulk sender)
- [ ] Módulo GPS (integración Wialon/Teltonika — roadmap)

### Fase 4 — Hardening
- [ ] Rate limiting en webhooks
- [ ] Encriptación de API keys en DB
- [ ] Backups automáticos PostgreSQL (pg_dump → S3 o B2)
- [ ] Monitoreo (UptimeRobot o Better Uptime)

---

## Costos estimados mensuales

| Servicio | Opción | Costo USD/mes |
|---|---|---|
| VPS (Hetzner CX32) | 4vCPU 8GB | ~$12 |
| Dominio + SSL | Let's Encrypt gratis | ~$1 (dominio) |
| Vercel (frontend) | Hobby plan | $0 |
| 360dialog — 14 líneas | $5–8 x línea | ~$70–112 |
| Meta — conversaciones WA | Por conversación | Variable (~$0.04/conv MX) |
| Email hosting | Zoho/Titan | ~$3 |
| **Total base** | | **~$86–128/mes** |

El mayor costo variable es WhatsApp. Con 100 conversaciones/día entre las 14 líneas = ~$120/mes adicional solo en cargos Meta.

---

## Riesgos y consideraciones

### WhatsApp — cumplimiento Meta
- Cada número requiere verificación de negocio en Meta Business Manager
- Plantillas de mensajes salientes (fuera de ventana 24h) necesitan aprobación previa
- No se puede enviar spam/bulk sin aprobación de plantillas — suspensión de número
- Considerar rate limits: ~80 mensajes/segundo por número

### Seguridad
- Webhook de 360dialog debe validar el header `D360-Signature` (HMAC-SHA256)
- API keys de WhatsApp son secretos críticos — nunca en código, solo en `.env` y gestión segura
- JWT con expiración corta (1h access + 7d refresh)
- HTTPS obligatorio en todo — Let's Encrypt via Certbot

### Escalabilidad futura
- El esquema de DB soporta N canales sin cambios — solo agregar filas en tabla `canales`
- Para >50 líneas WhatsApp: considerar arquitectura multi-tenant con un gateway dedicado
- Para >50 vendedores concurrentes: upgrade VPS o mover a managed PostgreSQL (RDS/Supabase)

---

## Resumen de decisión

**Deploy en VPS + Vercel separados.**

El backend DEBE ser VPS. Los procesos persistentes (WebSocket, BullMQ workers, polling IMAP, gestión de 14 conexiones WA) son incompatibles con serverless.

El frontend puede ir en Vercel sin problema — es SPA estática, aprovecha CDN global de Vercel sin costo adicional.

Para empezar rápido: Hetzner CX32 ($12/mes) corre todo el backend + DB + Redis cómodamente para el equipo descrito (11 vendedores, 14 líneas).
