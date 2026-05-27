-- =============================================================================
-- Logs de correos transaccionales (idempotentes, auditable)
-- No reemplaza billing_email_logs (comprobantes)
-- =============================================================================

CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies (id) ON DELETE SET NULL,
  user_id UUID,
  order_id UUID REFERENCES sms_orders (id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES billing_invoices (id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  template_key TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT NOT NULL DEFAULT 'mock',
  provider_message_id TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  CONSTRAINT email_logs_status_check CHECK (
    status IN ('pending', 'sent', 'failed', 'skipped')
  )
);

CREATE INDEX IF NOT EXISTS idx_email_logs_order_id ON email_logs (order_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_invoice_id ON email_logs (invoice_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON email_logs (recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_logs_template_key ON email_logs (template_key);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs (status);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_logs_order_template_sent
  ON email_logs (order_id, template_key)
  WHERE status = 'sent' AND order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_logs_invoice_template_sent
  ON email_logs (invoice_id, template_key)
  WHERE status = 'sent' AND invoice_id IS NOT NULL;

COMMENT ON TABLE email_logs IS 'Auditoría de emails transaccionales (activación, bienvenida, etc.)';
