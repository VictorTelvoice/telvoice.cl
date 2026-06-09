-- =============================================================================
-- Solicitudes de activación — Numeración SIM real (checkout landing)
-- =============================================================================

CREATE TABLE IF NOT EXISTS sim_activation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES sms_orders (id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies (id) ON DELETE SET NULL,
  checkout_email TEXT NOT NULL,
  payer_name TEXT,
  company_name TEXT,
  phone TEXT,
  tax_id TEXT,
  plan_id TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  included_sms_monthly INTEGER NOT NULL,
  activation_status TEXT NOT NULL DEFAULT 'pending_payment',
  client_number_id UUID REFERENCES client_numbers (id) ON DELETE SET NULL,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  CONSTRAINT sim_activation_requests_sms_positive CHECK (included_sms_monthly > 0),
  CONSTRAINT sim_activation_requests_status_check CHECK (
    activation_status IN (
      'pending_payment',
      'paid_pending_activation',
      'activation_review',
      'number_reserved',
      'number_assigned',
      'active',
      'rejected',
      'cancelled'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_sim_activation_requests_company
  ON sim_activation_requests (company_id)
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sim_activation_requests_status
  ON sim_activation_requests (activation_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sim_activation_requests_email
  ON sim_activation_requests (checkout_email);

DROP TRIGGER IF EXISTS trg_sim_activation_requests_updated_at ON sim_activation_requests;
CREATE TRIGGER trg_sim_activation_requests_updated_at
  BEFORE UPDATE ON sim_activation_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE sim_activation_requests IS
  'Cola de activación manual para compras de numeración SIM real (MercadoPago landing).';
