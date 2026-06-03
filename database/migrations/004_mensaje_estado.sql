-- =============================================================================
-- Electrica Ventas CRM — Migración 004: Estado de envío en mensajes
-- =============================================================================

ALTER TABLE mensajes
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'enviado'
    CHECK (estado IN ('pendiente', 'enviado', 'entregado', 'leido', 'error'));

ALTER TABLE mensajes
  ADD COLUMN IF NOT EXISTS error_detalle TEXT;

CREATE INDEX IF NOT EXISTS idx_mensajes_estado ON mensajes(estado) WHERE estado = 'error';
