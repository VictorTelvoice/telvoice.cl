-- =============================================================================
-- Configuración API visual del panel cliente por empresa (sin auth API real)
-- Migración ADITIVA. NO activa RLS. NO crea secretos de envío SMS.
-- =============================================================================

CREATE TABLE IF NOT EXISTS client_api_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies (id) ON DELETE CASCADE,
  user_id UUID NULL,
  api_status TEXT NOT NULL DEFAULT 'Activa',
  api_key_label TEXT NULL,
  api_key_masked TEXT NULL,
  api_key_demo TEXT NULL,
  environment TEXT NOT NULL DEFAULT 'Producción',
  webhook_url TEXT NULL,
  webhook_status TEXT NOT NULL DEFAULT 'No configurado',
  webhook_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  smpp_requested BOOLEAN NOT NULL DEFAULT false,
  smpp_requested_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'client_panel',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_api_settings_api_status_check CHECK (
    api_status IN ('Activa', 'Pausada', 'Pendiente')
  ),
  CONSTRAINT client_api_settings_webhook_status_check CHECK (
    webhook_status IN ('No configurado', 'Activo', 'Error')
  ),
  CONSTRAINT client_api_settings_environment_check CHECK (
    environment IN ('Producción', 'Sandbox')
  )
);

CREATE INDEX IF NOT EXISTS idx_client_api_settings_company_id
  ON client_api_settings (company_id);

CREATE INDEX IF NOT EXISTS idx_client_api_settings_api_status
  ON client_api_settings (api_status);

CREATE INDEX IF NOT EXISTS idx_client_api_settings_webhook_status
  ON client_api_settings (webhook_status);

CREATE INDEX IF NOT EXISTS idx_client_api_settings_updated
  ON client_api_settings (updated_at DESC);

DROP TRIGGER IF EXISTS trg_client_api_settings_updated_at ON client_api_settings;
CREATE TRIGGER trg_client_api_settings_updated_at
  BEFORE UPDATE ON client_api_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (opcional — NO habilitado por defecto)
-- ALTER TABLE client_api_settings ENABLE ROW LEVEL SECURITY;
-- ---------------------------------------------------------------------------
