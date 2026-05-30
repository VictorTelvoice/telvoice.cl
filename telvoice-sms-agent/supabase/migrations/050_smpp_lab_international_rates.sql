-- SMPP Lab + International Rate Plans (Wholesale ops)

-- ========== wholesale_smpp_connections ==========

CREATE TABLE IF NOT EXISTS wholesale_smpp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES wholesale_providers (id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 2775,
  system_id TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  system_type TEXT NOT NULL DEFAULT '',
  bind_type TEXT NOT NULL DEFAULT 'transceiver',
  source_addr_ton INTEGER NOT NULL DEFAULT 0,
  source_addr_npi INTEGER NOT NULL DEFAULT 0,
  source_address TEXT,
  tps_limit INTEGER NOT NULL DEFAULT 1,
  enquire_link_interval INTEGER NOT NULL DEFAULT 30000,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  last_bind_ok_at TIMESTAMPTZ,
  last_bind_failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wholesale_smpp_connections_bind_type_check CHECK (
    bind_type IN ('transmitter', 'receiver', 'transceiver')
  ),
  CONSTRAINT wholesale_smpp_connections_status_check CHECK (
    status IN ('draft', 'testing', 'active', 'paused', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS idx_wholesale_smpp_connections_provider
  ON wholesale_smpp_connections (provider_id);

CREATE INDEX IF NOT EXISTS idx_wholesale_smpp_connections_status
  ON wholesale_smpp_connections (status);

DROP TRIGGER IF EXISTS trg_wholesale_smpp_connections_updated_at ON wholesale_smpp_connections;
CREATE TRIGGER trg_wholesale_smpp_connections_updated_at
  BEFORE UPDATE ON wholesale_smpp_connections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ========== wholesale_smpp_bind_tests ==========

CREATE TABLE IF NOT EXISTS wholesale_smpp_bind_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES wholesale_smpp_connections (id) ON DELETE CASCADE,
  result TEXT NOT NULL,
  error_code INTEGER,
  error_message TEXT,
  latency_ms INTEGER,
  tested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wholesale_smpp_bind_tests_result_check CHECK (
    result IN ('success', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS idx_wholesale_smpp_bind_tests_connection
  ON wholesale_smpp_bind_tests (connection_id, tested_at DESC);

-- ========== wholesale_smpp_send_tests ==========

CREATE TABLE IF NOT EXISTS wholesale_smpp_send_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES wholesale_smpp_connections (id) ON DELETE CASCADE,
  destination_number TEXT NOT NULL,
  source_address TEXT,
  message_text TEXT NOT NULL,
  country_code TEXT,
  operator_name TEXT,
  traffic_type TEXT,
  submit_status TEXT NOT NULL DEFAULT 'pending',
  provider_message_id TEXT,
  command_status INTEGER,
  error_message TEXT,
  dlr_status TEXT NOT NULL DEFAULT 'pending',
  dlr_received_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wholesale_smpp_send_tests_submit_check CHECK (
    submit_status IN ('pending', 'submitted', 'failed')
  ),
  CONSTRAINT wholesale_smpp_send_tests_dlr_check CHECK (
    dlr_status IN ('pending', 'delivered', 'failed', 'unknown')
  ),
  CONSTRAINT wholesale_smpp_send_tests_traffic_check CHECK (
    traffic_type IS NULL OR traffic_type IN ('promotional', 'transactional', 'otp', 'mixed')
  )
);

CREATE INDEX IF NOT EXISTS idx_wholesale_smpp_send_tests_connection
  ON wholesale_smpp_send_tests (connection_id, sent_at DESC);

-- ========== wholesale_international_rate_plans ==========

CREATE TABLE IF NOT EXISTS wholesale_international_rate_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_name TEXT NOT NULL,
  country_iso TEXT NOT NULL,
  mcc TEXT,
  mnc TEXT,
  operator_name TEXT NOT NULL,
  traffic_type TEXT NOT NULL DEFAULT 'mixed',
  provider_id UUID REFERENCES wholesale_providers (id) ON DELETE SET NULL,
  smpp_connection_id UUID REFERENCES wholesale_smpp_connections (id) ON DELETE SET NULL,
  cost_price NUMERIC(12, 6),
  sale_price NUMERIC(12, 6),
  currency TEXT NOT NULL DEFAULT 'USD',
  margin NUMERIC(12, 6),
  valid_from DATE,
  valid_until DATE,
  pending_price BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wholesale_intl_rate_plans_status_check CHECK (
    status IN ('draft', 'testing', 'approved', 'live', 'paused', 'rejected')
  ),
  CONSTRAINT wholesale_intl_rate_plans_traffic_check CHECK (
    traffic_type IN ('promotional', 'transactional', 'otp', 'mixed')
  ),
  CONSTRAINT wholesale_intl_rate_plans_currency_check CHECK (
    currency IN ('USD', 'EUR', 'CLP')
  )
);

CREATE INDEX IF NOT EXISTS idx_wholesale_intl_rate_plans_country
  ON wholesale_international_rate_plans (country_iso, status);

CREATE INDEX IF NOT EXISTS idx_wholesale_intl_rate_plans_provider
  ON wholesale_international_rate_plans (provider_id);

DROP TRIGGER IF EXISTS trg_wholesale_intl_rate_plans_updated_at ON wholesale_international_rate_plans;
CREATE TRIGGER trg_wholesale_intl_rate_plans_updated_at
  BEFORE UPDATE ON wholesale_international_rate_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ========== Extend wholesale_routes ==========

ALTER TABLE wholesale_routes
  ADD COLUMN IF NOT EXISTS smpp_connection_id UUID REFERENCES wholesale_smpp_connections (id) ON DELETE SET NULL;

ALTER TABLE wholesale_routes
  ADD COLUMN IF NOT EXISTS rate_plan_id UUID REFERENCES wholesale_international_rate_plans (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wholesale_routes_smpp_connection
  ON wholesale_routes (smpp_connection_id);

CREATE INDEX IF NOT EXISTS idx_wholesale_routes_rate_plan
  ON wholesale_routes (rate_plan_id);
