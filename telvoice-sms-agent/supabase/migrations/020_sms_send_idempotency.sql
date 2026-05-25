-- Idempotencia de envíos desde /app/send-sms (evita duplicados por refresh o doble POST)

CREATE TABLE IF NOT EXISTS sms_send_idempotency (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  created_by UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  campaign_id UUID REFERENCES sms_campaigns (id) ON DELETE SET NULL,
  message_id UUID,
  send_mode TEXT,
  flash_text TEXT,
  error_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT sms_send_idempotency_status_check CHECK (
    status IN ('pending', 'processing', 'completed', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS idx_sms_send_idempotency_company_status
  ON sms_send_idempotency (company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_send_idempotency_expires
  ON sms_send_idempotency (expires_at);

DROP TRIGGER IF EXISTS trg_sms_send_idempotency_updated_at ON sms_send_idempotency;
CREATE TRIGGER trg_sms_send_idempotency_updated_at
  BEFORE UPDATE ON sms_send_idempotency
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Una campaña por empresa y clave de idempotencia (segunda capa ante carreras)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_campaigns_company_idempotency_key
  ON sms_campaigns (company_id, ((metadata ->> 'idempotency_key')))
  WHERE (metadata ->> 'idempotency_key') IS NOT NULL
    AND (metadata ->> 'idempotency_key') <> '';
