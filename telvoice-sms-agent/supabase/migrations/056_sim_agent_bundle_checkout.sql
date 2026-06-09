-- =============================================================================
-- Checkout landing SIM + Agente (sim_agent_bundle)
-- =============================================================================

ALTER TABLE sim_activation_requests
  ADD COLUMN IF NOT EXISTS use_case TEXT;

ALTER TABLE agent_plan_requests
  ADD COLUMN IF NOT EXISTS order_id UUID UNIQUE REFERENCES sms_orders (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checkout_email TEXT,
  ADD COLUMN IF NOT EXISTS use_case TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'panel';

ALTER TABLE agent_plan_requests DROP CONSTRAINT IF EXISTS agent_plan_requests_status_check;
ALTER TABLE agent_plan_requests ADD CONSTRAINT agent_plan_requests_status_check CHECK (
  status IN (
    'pending',
    'reviewing',
    'approved',
    'rejected',
    'activated',
    'paid_pending_setup'
  )
);

CREATE INDEX IF NOT EXISTS idx_agent_plan_requests_order
  ON agent_plan_requests (order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_plan_requests_status
  ON agent_plan_requests (status, created_at DESC);

COMMENT ON COLUMN agent_plan_requests.order_id IS
  'Orden MercadoPago del checkout landing (sim_agent_bundle).';
COMMENT ON COLUMN agent_plan_requests.source IS
  'panel | landing_sim_agent_bundle';
