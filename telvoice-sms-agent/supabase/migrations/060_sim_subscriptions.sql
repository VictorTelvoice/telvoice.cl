-- Suscripciones mensuales numeración SIM (landing pública).

CREATE TABLE IF NOT EXISTS sim_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES sms_orders (id) ON DELETE RESTRICT,
  company_id UUID REFERENCES companies (id) ON DELETE SET NULL,
  checkout_email TEXT NOT NULL,
  inventory_number_id UUID REFERENCES real_number_inventory (id) ON DELETE SET NULL,
  client_number_id UUID REFERENCES client_numbers (id) ON DELETE SET NULL,
  plan_id TEXT NOT NULL,
  included_sms_monthly INTEGER NOT NULL CHECK (included_sms_monthly > 0),
  monthly_amount_clp NUMERIC(12, 2) NOT NULL CHECK (monthly_amount_clp >= 0),
  currency TEXT NOT NULL DEFAULT 'CLP',
  mercadopago_preapproval_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  next_billing_date TIMESTAMPTZ,
  last_payment_id TEXT,
  last_credit_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sim_subscriptions_status_check CHECK (
    status IN ('pending', 'authorized', 'active', 'paused', 'cancelled', 'failed')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sim_subscriptions_order_id
  ON sim_subscriptions (order_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sim_subscriptions_mp_preapproval
  ON sim_subscriptions (mercadopago_preapproval_id)
  WHERE mercadopago_preapproval_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sim_subscriptions_company_status
  ON sim_subscriptions (company_id, status);

CREATE INDEX IF NOT EXISTS idx_sim_subscriptions_checkout_email
  ON sim_subscriptions (checkout_email);

DROP TRIGGER IF EXISTS trg_sim_subscriptions_updated_at ON sim_subscriptions;
CREATE TRIGGER trg_sim_subscriptions_updated_at
  BEFORE UPDATE ON sim_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE sim_subscriptions IS
  'Suscripción mensual MercadoPago para numeración SIM real (landing pública).';
