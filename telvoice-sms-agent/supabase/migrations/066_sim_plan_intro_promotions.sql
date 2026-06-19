-- Promoción inicial administrable por plan SIM + registro de cambio de precio futuro.

ALTER TABLE sim_subscription_plan_settings
  ADD COLUMN IF NOT EXISTS promo_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS promo_discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_duration_months INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_label TEXT,
  ADD COLUMN IF NOT EXISTS promo_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sim_plan_promo_discount_range'
  ) THEN
    ALTER TABLE sim_subscription_plan_settings
      ADD CONSTRAINT sim_plan_promo_discount_range
      CHECK (promo_discount_percent >= 0 AND promo_discount_percent <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sim_plan_promo_duration_non_negative'
  ) THEN
    ALTER TABLE sim_subscription_plan_settings
      ADD CONSTRAINT sim_plan_promo_duration_non_negative
      CHECK (promo_duration_months >= 0);
  END IF;
END $$;

COMMENT ON COLUMN sim_subscription_plan_settings.promo_enabled IS
  'Promoción inicial mensual (N meses con descuento). No aplica al ciclo anual.';

CREATE TABLE IF NOT EXISTS sim_subscription_scheduled_price_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES sms_orders (id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies (id) ON DELETE SET NULL,
  preapproval_id TEXT,
  plan_id TEXT NOT NULL,
  current_amount_clp INTEGER NOT NULL CHECK (current_amount_clp >= 0),
  next_amount_clp INTEGER NOT NULL CHECK (next_amount_clp >= 0),
  change_after_months INTEGER NOT NULL CHECK (change_after_months > 0),
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ,
  CONSTRAINT sim_subscription_scheduled_price_changes_status_check CHECK (
    status IN ('pending', 'applied', 'failed', 'cancelled')
  )
);

DROP TRIGGER IF EXISTS trg_sim_subscription_scheduled_price_changes_updated_at
  ON sim_subscription_scheduled_price_changes;
CREATE TRIGGER trg_sim_subscription_scheduled_price_changes_updated_at
  BEFORE UPDATE ON sim_subscription_scheduled_price_changes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_sim_sub_sched_price_changes_pending
  ON sim_subscription_scheduled_price_changes (status, scheduled_at)
  WHERE status = 'pending';

COMMENT ON TABLE sim_subscription_scheduled_price_changes IS
  'Cambio programado de monto en preapproval SIM tras promoción inicial (ej. volver a precio normal).';
