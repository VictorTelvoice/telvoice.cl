-- =============================================================================
-- Idempotencia explícita para sms_api_messages (Fase 3.5)
-- =============================================================================

ALTER TABLE sms_api_messages
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT NULL,
  ADD COLUMN IF NOT EXISTS payload_hash TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_api_messages_idempotency_key
  ON sms_api_messages (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_api_messages_payload_hash
  ON sms_api_messages (payload_hash)
  WHERE payload_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sms_api_messages_idempotency_unique
  ON sms_api_messages (company_id, api_key_id, environment, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
