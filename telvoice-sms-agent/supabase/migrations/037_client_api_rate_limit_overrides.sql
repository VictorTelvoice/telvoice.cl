-- =============================================================================
-- Overrides administrativos de rate limits API (Fase rate-limit admin)
-- Migración ADITIVA. NO activa RLS. NO afecta wallet ni envío SMS.
-- =============================================================================

CREATE TABLE IF NOT EXISTS client_api_rate_limit_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  api_key_id UUID NULL REFERENCES client_api_keys (id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'sandbox',
  limit_per_minute INTEGER NULL,
  limit_per_day INTEGER NULL,
  status TEXT NOT NULL DEFAULT 'active',
  reason TEXT NULL,
  created_by_admin_id UUID NULL REFERENCES admin_users (id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'admin_panel',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_api_rate_limit_overrides_environment_check CHECK (
    environment IN ('sandbox', 'production')
  ),
  CONSTRAINT client_api_rate_limit_overrides_status_check CHECK (
    status IN ('active', 'paused', 'disabled')
  ),
  CONSTRAINT client_api_rate_limit_overrides_minute_positive CHECK (
    limit_per_minute IS NULL OR limit_per_minute > 0
  ),
  CONSTRAINT client_api_rate_limit_overrides_day_positive CHECK (
    limit_per_day IS NULL OR limit_per_day > 0
  ),
  CONSTRAINT client_api_rate_limit_overrides_limit_required CHECK (
    limit_per_minute IS NOT NULL OR limit_per_day IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_client_api_rate_limit_overrides_company_id
  ON client_api_rate_limit_overrides (company_id);

CREATE INDEX IF NOT EXISTS idx_client_api_rate_limit_overrides_api_key_id
  ON client_api_rate_limit_overrides (api_key_id);

CREATE INDEX IF NOT EXISTS idx_client_api_rate_limit_overrides_environment
  ON client_api_rate_limit_overrides (environment);

CREATE INDEX IF NOT EXISTS idx_client_api_rate_limit_overrides_status
  ON client_api_rate_limit_overrides (status);

CREATE INDEX IF NOT EXISTS idx_client_api_rate_limit_overrides_updated
  ON client_api_rate_limit_overrides (updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_api_rate_limit_overrides_active_unique
  ON client_api_rate_limit_overrides (
    company_id,
    COALESCE(api_key_id, '00000000-0000-0000-0000-000000000000'::uuid),
    environment
  )
  WHERE status = 'active';

DROP TRIGGER IF EXISTS trg_client_api_rate_limit_overrides_updated_at
  ON client_api_rate_limit_overrides;
CREATE TRIGGER trg_client_api_rate_limit_overrides_updated_at
  BEFORE UPDATE ON client_api_rate_limit_overrides
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (opcional — NO habilitado por defecto)
-- ALTER TABLE client_api_rate_limit_overrides ENABLE ROW LEVEL SECURITY;
-- ---------------------------------------------------------------------------
