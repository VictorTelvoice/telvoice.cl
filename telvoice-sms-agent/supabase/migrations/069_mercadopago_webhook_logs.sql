-- Auditoría persistente de webhooks Mercado Pago (agent + reconciliación).

CREATE TABLE IF NOT EXISTS mercadopago_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  resource_id TEXT,
  delivery_source TEXT NOT NULL DEFAULT 'direct',
  external_reference TEXT,
  order_id UUID,
  payer_email TEXT,
  http_method TEXT,
  request_query JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_body JSONB NOT NULL DEFAULT '{}'::jsonb,
  processing_status TEXT NOT NULL DEFAULT 'received',
  processing_result TEXT,
  processing_error TEXT,
  processing_outcome JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT mercadopago_webhook_logs_status_check CHECK (
    processing_status IN ('received', 'processed', 'failed', 'skipped')
  )
);

CREATE INDEX IF NOT EXISTS idx_mp_webhook_logs_topic_resource
  ON mercadopago_webhook_logs (topic, resource_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mp_webhook_logs_order_id
  ON mercadopago_webhook_logs (order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mp_webhook_logs_created_at
  ON mercadopago_webhook_logs (created_at DESC);

COMMENT ON TABLE mercadopago_webhook_logs IS
  'Auditoría de webhooks Mercado Pago: topic, resource, orden resuelta y resultado.';
