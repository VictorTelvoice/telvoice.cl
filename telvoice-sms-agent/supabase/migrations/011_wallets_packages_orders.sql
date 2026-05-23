-- =============================================================================
-- Wallets, bolsas SMS y órdenes — migración ADITIVA (Etapa 6)
-- No modifica balances legacy de clients; modelo comercial por company_id.
-- =============================================================================

CREATE TABLE IF NOT EXISTS sms_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'CL',
  sms_quantity INTEGER NOT NULL,
  unit_price NUMERIC(12, 2),
  total_price NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CLP',
  package_type TEXT NOT NULL DEFAULT 'prepaid',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sms_packages_sms_quantity_positive CHECK (sms_quantity > 0),
  CONSTRAINT sms_packages_total_price_non_negative CHECK (total_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_sms_packages_country_active
  ON sms_packages (country, is_active, sort_order);

DROP TRIGGER IF EXISTS trg_sms_packages_updated_at ON sms_packages;
CREATE TRIGGER trg_sms_packages_updated_at
  BEFORE UPDATE ON sms_packages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS company_sms_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  country TEXT NOT NULL DEFAULT 'CL',
  available_sms INTEGER NOT NULL DEFAULT 0,
  reserved_sms INTEGER NOT NULL DEFAULT 0,
  consumed_sms INTEGER NOT NULL DEFAULT 0,
  total_purchased_sms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT company_sms_wallets_company_country_unique UNIQUE (company_id, country),
  CONSTRAINT company_sms_wallets_available_non_negative CHECK (available_sms >= 0),
  CONSTRAINT company_sms_wallets_reserved_non_negative CHECK (reserved_sms >= 0),
  CONSTRAINT company_sms_wallets_consumed_non_negative CHECK (consumed_sms >= 0),
  CONSTRAINT company_sms_wallets_purchased_non_negative CHECK (total_purchased_sms >= 0),
  CONSTRAINT company_sms_wallets_status_check CHECK (
    status IN ('active', 'frozen', 'suspended')
  )
);

CREATE INDEX IF NOT EXISTS idx_company_sms_wallets_company
  ON company_sms_wallets (company_id);

DROP TRIGGER IF EXISTS trg_company_sms_wallets_updated_at ON company_sms_wallets;
CREATE TRIGGER trg_company_sms_wallets_updated_at
  BEFORE UPDATE ON company_sms_wallets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS sms_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  package_id UUID REFERENCES sms_packages (id) ON DELETE SET NULL,
  sms_quantity INTEGER NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CLP',
  payment_provider TEXT,
  payment_reference TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  credit_status TEXT NOT NULL DEFAULT 'pending',
  credited_at TIMESTAMPTZ,
  created_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sms_orders_sms_quantity_positive CHECK (sms_quantity > 0),
  CONSTRAINT sms_orders_amount_non_negative CHECK (amount >= 0),
  CONSTRAINT sms_orders_payment_status_check CHECK (
    payment_status IN ('pending', 'paid', 'rejected', 'cancelled', 'refunded')
  ),
  CONSTRAINT sms_orders_credit_status_check CHECK (
    credit_status IN ('pending', 'credited', 'failed', 'reversed')
  )
);

CREATE INDEX IF NOT EXISTS idx_sms_orders_company_created
  ON sms_orders (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_orders_payment_credit
  ON sms_orders (payment_status, credit_status);

DROP TRIGGER IF EXISTS trg_sms_orders_updated_at ON sms_orders;
CREATE TRIGGER trg_sms_orders_updated_at
  BEFORE UPDATE ON sms_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES company_sms_wallets (id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  sms_amount INTEGER NOT NULL,
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  description TEXT,
  created_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wallet_transactions_type_check CHECK (
    type IN (
      'purchase_credit',
      'manual_credit',
      'manual_debit',
      'sms_debit',
      'sms_refund',
      'reserve',
      'release_reserved',
      'adjustment',
      'reversal'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_created
  ON wallet_transactions (wallet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_company_created
  ON wallet_transactions (company_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_transactions_order_purchase_unique
  ON wallet_transactions (reference_id)
  WHERE reference_type = 'sms_order' AND type = 'purchase_credit';

COMMENT ON TABLE sms_packages IS 'Bolsas SMS vendibles (catálogo comercial)';
COMMENT ON TABLE company_sms_wallets IS 'Saldo SMS por empresa y país';
COMMENT ON TABLE sms_orders IS 'Órdenes de compra de bolsas';
COMMENT ON TABLE wallet_transactions IS 'Historial de movimientos de saldo SMS';
