-- =============================================================================
-- Idempotencia envío comprobante billing (claim-before-send)
-- Evita duplicar email por race condition en webhook MercadoPago / billing sync.
-- =============================================================================

ALTER TABLE billing_email_logs
  ADD COLUMN IF NOT EXISTS email_type TEXT NOT NULL DEFAULT 'purchase_receipt';

ALTER TABLE billing_email_logs
  ADD COLUMN IF NOT EXISTS to_email_normalized TEXT;

UPDATE billing_email_logs
SET to_email_normalized = lower(trim(to_email))
WHERE to_email_normalized IS NULL
  AND to_email IS NOT NULL
  AND trim(to_email) <> '';

ALTER TABLE billing_email_logs
  DROP CONSTRAINT IF EXISTS billing_email_logs_status_check;

ALTER TABLE billing_email_logs
  ADD CONSTRAINT billing_email_logs_status_check CHECK (
    status IN ('pending', 'sending', 'sent', 'failed', 'retrying')
  );

-- Un solo envío automático activo o completado por invoice + destinatario + tipo.
-- Reenvíos manuales (metadata.is_resend = true) quedan fuera del índice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_email_logs_invoice_recipient_type_active
  ON billing_email_logs (invoice_id, to_email_normalized, email_type)
  WHERE status IN ('sending', 'sent')
    AND to_email_normalized IS NOT NULL
    AND to_email_normalized <> ''
    AND COALESCE(metadata->>'is_resend', 'false') <> 'true';

COMMENT ON COLUMN billing_email_logs.email_type IS
  'Tipo de correo billing (ej. purchase_receipt). Parte de la llave de idempotencia.';

COMMENT ON COLUMN billing_email_logs.to_email_normalized IS
  'Destinatario normalizado (lower+trim) para índice único de idempotencia.';
