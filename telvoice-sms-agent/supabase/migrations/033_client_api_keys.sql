-- =============================================================================
-- API Keys reales del panel cliente (Fase 1 — sin envío SMS público)
-- Migración ADITIVA. NO activa RLS. NO almacena secretos en texto plano.
-- =============================================================================

CREATE TABLE IF NOT EXISTS client_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  created_by_user_id UUID NULL,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_masked TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  environment TEXT NOT NULL DEFAULT 'sandbox',
  last_used_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  revoked_reason TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'client_panel',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_api_keys_status_check CHECK (
    status IN ('active', 'paused', 'revoked', 'expired')
  ),
  CONSTRAINT client_api_keys_environment_check CHECK (
    environment IN ('sandbox', 'production')
  ),
  CONSTRAINT client_api_keys_revoked_at_check CHECK (
    (status = 'revoked' AND revoked_at IS NOT NULL)
    OR (status <> 'revoked')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_api_keys_key_prefix
  ON client_api_keys (key_prefix);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_api_keys_key_hash
  ON client_api_keys (key_hash);

CREATE INDEX IF NOT EXISTS idx_client_api_keys_company_id
  ON client_api_keys (company_id);

CREATE INDEX IF NOT EXISTS idx_client_api_keys_status
  ON client_api_keys (status);

CREATE INDEX IF NOT EXISTS idx_client_api_keys_environment
  ON client_api_keys (environment);

CREATE INDEX IF NOT EXISTS idx_client_api_keys_updated
  ON client_api_keys (updated_at DESC);

DROP TRIGGER IF EXISTS trg_client_api_keys_updated_at ON client_api_keys;
CREATE TRIGGER trg_client_api_keys_updated_at
  BEFORE UPDATE ON client_api_keys
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (opcional — NO habilitado por defecto)
-- ALTER TABLE client_api_keys ENABLE ROW LEVEL SECURITY;
-- ---------------------------------------------------------------------------
