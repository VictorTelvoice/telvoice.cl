-- =============================================================================
-- Configuración editable del panel cliente por empresa
-- Migración ADITIVA. NO activa RLS. NO modifica companies/invoices/auth.
-- =============================================================================

CREATE TABLE IF NOT EXISTS client_company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies (id) ON DELETE CASCADE,
  user_id UUID NULL,
  company_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  billing_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  notification_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  panel_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  sms_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'client_panel',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_company_settings_company_id
  ON client_company_settings (company_id);

CREATE INDEX IF NOT EXISTS idx_client_company_settings_updated
  ON client_company_settings (updated_at DESC);

DROP TRIGGER IF EXISTS trg_client_company_settings_updated_at ON client_company_settings;
CREATE TRIGGER trg_client_company_settings_updated_at
  BEFORE UPDATE ON client_company_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (opcional — NO habilitado por defecto)
-- ALTER TABLE client_company_settings ENABLE ROW LEVEL SECURITY;
-- ---------------------------------------------------------------------------
