-- =============================================================================
-- Electrica Ventas CRM — Migración 005: Núcleo de datos (clasificación + cierre)
-- PostgreSQL 16
-- Soporta TODO.md items 5 (clasificación), 8 (cierre parcial/total),
-- 9 (cerró en mostrador), 12 (excluir informativos) y 14 (recordatorios).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- LEADS — clasificación Informativo / Prospecto (item 5)
--   NULL = sin clasificar (recién llegado a bandeja general).
--   'informativo' = se atiende y cierra, NO se asigna ni cuenta en métricas.
--   'prospecto'   = se asigna a vendedor, entra al embudo medible.
-- ---------------------------------------------------------------------------
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS clasificacion TEXT
    CHECK (clasificacion IN ('informativo', 'prospecto'));

-- LEADS — cerró en mostrador (item 9), separado de motivo_no_cierre.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS cerrado_en_mostrador BOOLEAN NOT NULL DEFAULT false;

-- Ticket de mostrador opcional (ligable después).
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS ticket_mostrador TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_clasificacion ON leads (clasificacion);

-- ---------------------------------------------------------------------------
-- USUARIOS — teléfono del vendedor.
--   Lo referencian GET /leads/:id (u.telefono) y el PDF de cotización
--   (vendedor.telefono); la columna faltaba y rompía ambos con error 500.
-- ---------------------------------------------------------------------------
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS telefono TEXT;

-- ---------------------------------------------------------------------------
-- COTIZACIONES — cierre parcial / total + monto cerrado (item 8)
--   estado se mantiene; el cierre se modela aparte para soportar parcial.
-- ---------------------------------------------------------------------------
ALTER TABLE cotizaciones
  ADD COLUMN IF NOT EXISTS cierre_tipo TEXT
    CHECK (cierre_tipo IN ('parcial', 'total'));

ALTER TABLE cotizaciones
  ADD COLUMN IF NOT EXISTS monto_cerrado NUMERIC(12,2)
    CHECK (monto_cerrado IS NULL OR monto_cerrado >= 0);

ALTER TABLE cotizaciones
  ADD COLUMN IF NOT EXISTS cierre_notas TEXT;

ALTER TABLE cotizaciones
  ADD COLUMN IF NOT EXISTS cerrada_at TIMESTAMPTZ;

-- Recordatorio de seguimiento al vendedor (item 14): última vez que se avisó.
ALTER TABLE cotizaciones
  ADD COLUMN IF NOT EXISTS recordatorio_enviado_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cotizaciones_cerrada
  ON cotizaciones (cerrada_at) WHERE cerrada_at IS NOT NULL;
