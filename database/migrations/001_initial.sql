-- =============================================================================
-- Electrica Ventas CRM — Migración 001: Esquema inicial
-- PostgreSQL 16
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- USUARIOS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre        TEXT        NOT NULL,
    email         TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    rol           TEXT        NOT NULL CHECK (rol IN ('gerente', 'vendedor')),
    zona          TEXT,
    activo        BOOLEAN     NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- CANALES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS canales (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo                TEXT        NOT NULL,   -- 'whatsapp' | 'email' | 'web'
    nombre              TEXT        NOT NULL,
    numero              TEXT,
    api_key_encrypted   TEXT,
    webhook_secret      TEXT,
    activo              BOOLEAN     NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- LEADS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    contacto            TEXT        NOT NULL,
    empresa             TEXT,
    telefono            TEXT,
    email               TEXT,
    canal_id            UUID        REFERENCES canales(id) ON DELETE SET NULL,
    etapa               TEXT        NOT NULL DEFAULT 'nuevo'
                                    CHECK (etapa IN ('nuevo','contactado','cotizado','negociacion','cerrado','no_cierre')),
    asignado_a          UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
    prioridad           TEXT        NOT NULL DEFAULT 'media'
                                    CHECK (prioridad IN ('alta','media','baja')),
    zona                TEXT,
    monto_estimado      NUMERIC(12,2),
    motivo_no_cierre    TEXT,
    notas               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ultima_interaccion  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- MENSAJES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mensajes (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id     UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    canal_id    UUID        REFERENCES canales(id) ON DELETE SET NULL,
    direccion   TEXT        NOT NULL CHECK (direccion IN ('entrante','saliente')),
    origen      TEXT        NOT NULL CHECK (origen IN ('cliente','vendedor','sistema','bot')),
    usuario_id  UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
    texto       TEXT,
    tipo_media  TEXT,
    media_url   TEXT,
    wa_msg_id   TEXT        UNIQUE,
    ts          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- PRODUCTOS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS productos (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre      TEXT        NOT NULL,
    descripcion TEXT,
    precio      NUMERIC(10,2) NOT NULL,
    unidad      TEXT        NOT NULL DEFAULT 'pieza',
    activo      BOOLEAN     NOT NULL DEFAULT true
);

-- ---------------------------------------------------------------------------
-- COTIZACIONES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cotizaciones (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    folio         TEXT        NOT NULL UNIQUE,
    lead_id       UUID        NOT NULL REFERENCES leads(id) ON DELETE RESTRICT,
    vendedor_id   UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
    estado        TEXT        NOT NULL DEFAULT 'enviada'
                              CHECK (estado IN ('enviada','vista','aceptada','rechazada','pendiente')),
    vigencia_dias INT         NOT NULL DEFAULT 15,
    notas         TEXT,
    pdf_url       TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- COTIZACION_ITEMS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cotizacion_items (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    cotizacion_id    UUID          NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
    producto_id      UUID          REFERENCES productos(id) ON DELETE SET NULL,
    nombre           TEXT          NOT NULL,
    cantidad         INT           NOT NULL CHECK (cantidad > 0),
    precio_unitario  NUMERIC(10,2) NOT NULL CHECK (precio_unitario >= 0)
);

-- ---------------------------------------------------------------------------
-- PLANTILLAS WHATSAPP
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plantillas_wa (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre       TEXT        NOT NULL UNIQUE,
    categoria    TEXT        NOT NULL CHECK (categoria IN ('UTILITY','MARKETING','AUTHENTICATION')),
    contenido    TEXT        NOT NULL,
    estado_meta  TEXT        NOT NULL DEFAULT 'pendiente',
    canal_id     UUID        REFERENCES canales(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- CAMPANAS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campanas (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre        TEXT        NOT NULL,
    tipo          TEXT        NOT NULL,
    estado        TEXT        NOT NULL DEFAULT 'borrador',
    plantilla_id  UUID        REFERENCES plantillas_wa(id) ON DELETE SET NULL,
    lead_ids      UUID[]      NOT NULL DEFAULT '{}',
    creada_por    UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    enviada_at    TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- ASIGNACION_REGLAS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS asignacion_reglas (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    canal_id   UUID        NOT NULL UNIQUE REFERENCES canales(id) ON DELETE CASCADE,
    modo       TEXT        NOT NULL DEFAULT 'round_robin'
                           CHECK (modo IN ('round_robin','carga','manual')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
