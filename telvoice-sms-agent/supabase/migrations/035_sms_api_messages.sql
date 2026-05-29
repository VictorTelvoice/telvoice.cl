-- =============================================================================
-- Mensajes API SMS sandbox (Fase 3 — sin envío real)
-- Migración ADITIVA. NO activa RLS. NO descuenta wallet.
-- =============================================================================

CREATE TABLE IF NOT EXISTS sms_api_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  api_key_id UUID NOT NULL REFERENCES client_api_keys (id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  external_reference TEXT NULL,
  recipient TEXT NOT NULL,
  sender TEXT NULL,
  message TEXT NOT NULL,
  country TEXT NULL,
  segments INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'sandbox_accepted',
  environment TEXT NOT NULL DEFAULT 'sandbox',
  provider_message_id TEXT NULL,
  dlr_status TEXT NULL,
  cost_sms INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sms_api_messages_status_check CHECK (
    status IN (
      'sandbox_accepted',
      'sandbox_rejected',
      'pending',
      'sent',
      'delivered',
      'failed',
      'expired',
      'rejected'
    )
  ),
  CONSTRAINT sms_api_messages_environment_check CHECK (
    environment IN ('sandbox', 'production')
  )
);

CREATE INDEX IF NOT EXISTS idx_sms_api_messages_company_id
  ON sms_api_messages (company_id);

CREATE INDEX IF NOT EXISTS idx_sms_api_messages_api_key_id
  ON sms_api_messages (api_key_id);

CREATE INDEX IF NOT EXISTS idx_sms_api_messages_request_id
  ON sms_api_messages (request_id);

CREATE INDEX IF NOT EXISTS idx_sms_api_messages_status
  ON sms_api_messages (status);

CREATE INDEX IF NOT EXISTS idx_sms_api_messages_environment
  ON sms_api_messages (environment);

CREATE INDEX IF NOT EXISTS idx_sms_api_messages_created
  ON sms_api_messages (created_at DESC);

DROP TRIGGER IF EXISTS trg_sms_api_messages_updated_at ON sms_api_messages;
CREATE TRIGGER trg_sms_api_messages_updated_at
  BEFORE UPDATE ON sms_api_messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (opcional — NO habilitado por defecto)
-- ALTER TABLE sms_api_messages ENABLE ROW LEVEL SECURITY;
-- ---------------------------------------------------------------------------
