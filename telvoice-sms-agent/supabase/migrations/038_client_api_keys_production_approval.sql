-- =============================================================================
-- Aprobación administrativa production para API Keys (sin envío SMS real aún)
-- Migración ADITIVA. NO activa RLS.
-- =============================================================================

ALTER TABLE client_api_keys
  ADD COLUMN IF NOT EXISTS production_approved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS production_approved_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS production_approved_by_admin_id UUID NULL REFERENCES admin_users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS production_approval_notes TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_client_api_keys_production_approved
  ON client_api_keys (production_approved)
  WHERE environment = 'production';

-- ---------------------------------------------------------------------------
-- RLS (opcional — NO habilitado por defecto)
-- ---------------------------------------------------------------------------
