-- Eventos comerciales del Agente Telvoice (cotizaciones, links, saldo insuficiente).
CREATE TABLE IF NOT EXISTS agent_sales_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  channel TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'agent_panel',
  session_id TEXT,
  company_id UUID REFERENCES companies (id) ON DELETE SET NULL,
  user_id UUID,
  event_type TEXT NOT NULL,
  quantity_sms INTEGER,
  unit_price_net INTEGER,
  subtotal_net INTEGER,
  iva INTEGER,
  total_clp INTEGER,
  order_id UUID REFERENCES sms_orders (id) ON DELETE SET NULL,
  payment_status TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT agent_sales_events_type_check CHECK (
    event_type IN (
      'quote_created',
      'payment_link_created',
      'payment_link_reused',
      'order_paid',
      'insufficient_balance_detected',
      'manual_quote_requested',
      'blocked_campaign_recovered'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_agent_sales_events_created
  ON agent_sales_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_sales_events_company
  ON agent_sales_events (company_id, created_at DESC)
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_sales_events_session
  ON agent_sales_events (session_id, created_at DESC)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_sales_events_type
  ON agent_sales_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_sales_events_order
  ON agent_sales_events (order_id)
  WHERE order_id IS NOT NULL;

COMMENT ON TABLE agent_sales_events IS
  'Métricas comerciales del agente panel: cotizaciones, links MP y bloqueos por saldo.';
