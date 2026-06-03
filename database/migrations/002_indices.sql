-- =============================================================================
-- Electrica Ventas CRM — Migración 002: Índices
-- PostgreSQL 16
-- =============================================================================

-- ---------------------------------------------------------------------------
-- LEADS
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_leads_etapa
    ON leads (etapa);

CREATE INDEX IF NOT EXISTS idx_leads_asignado
    ON leads (asignado_a);

CREATE INDEX IF NOT EXISTS idx_leads_canal
    ON leads (canal_id);

CREATE INDEX IF NOT EXISTS idx_leads_created
    ON leads (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_ultima_interaccion
    ON leads (ultima_interaccion DESC);

CREATE INDEX IF NOT EXISTS idx_leads_prioridad
    ON leads (prioridad);

CREATE INDEX IF NOT EXISTS idx_leads_zona
    ON leads (zona);

-- ---------------------------------------------------------------------------
-- MENSAJES
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mensajes_lead
    ON mensajes (lead_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_mensajes_wa_id
    ON mensajes (wa_msg_id)
    WHERE wa_msg_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mensajes_canal
    ON mensajes (canal_id);

CREATE INDEX IF NOT EXISTS idx_mensajes_ts
    ON mensajes (ts DESC);

-- ---------------------------------------------------------------------------
-- COTIZACIONES
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cotizaciones_lead
    ON cotizaciones (lead_id);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_estado
    ON cotizaciones (estado);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_vendedor
    ON cotizaciones (vendedor_id);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_created
    ON cotizaciones (created_at DESC);

-- ---------------------------------------------------------------------------
-- COTIZACION_ITEMS
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cotizacion_items_cotizacion
    ON cotizacion_items (cotizacion_id);

CREATE INDEX IF NOT EXISTS idx_cotizacion_items_producto
    ON cotizacion_items (producto_id)
    WHERE producto_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- CAMPANAS
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_campanas_estado
    ON campanas (estado);

CREATE INDEX IF NOT EXISTS idx_campanas_creada_por
    ON campanas (creada_por);

-- ---------------------------------------------------------------------------
-- PLANTILLAS_WA
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_plantillas_wa_categoria
    ON plantillas_wa (categoria);

CREATE INDEX IF NOT EXISTS idx_plantillas_wa_estado_meta
    ON plantillas_wa (estado_meta);
