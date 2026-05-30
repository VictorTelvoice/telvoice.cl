-- Wholesale Core (Telvoice.net) — proveedores, rutas, rates, pruebas, clientes y oportunidades

-- ========== wholesale_providers ==========

CREATE TABLE IF NOT EXISTS wholesale_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  contact_name TEXT,
  contact_email TEXT,
  contact_whatsapp TEXT,
  country_code TEXT NOT NULL DEFAULT 'CL',
  connection_type TEXT NOT NULL DEFAULT 'http_api',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wholesale_providers_status_check CHECK (
    status IN ('draft', 'testing', 'approved', 'live', 'paused', 'rejected')
  ),
  CONSTRAINT wholesale_providers_connection_type_check CHECK (
    connection_type IN ('http_api', 'smpp', 'other')
  )
);

CREATE INDEX IF NOT EXISTS idx_wholesale_providers_status
  ON wholesale_providers (status);

DROP TRIGGER IF EXISTS trg_wholesale_providers_updated_at ON wholesale_providers;
CREATE TRIGGER trg_wholesale_providers_updated_at
  BEFORE UPDATE ON wholesale_providers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ========== wholesale_routes ==========

CREATE TABLE IF NOT EXISTS wholesale_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES wholesale_providers (id) ON DELETE RESTRICT,
  country_code TEXT NOT NULL,
  country_name TEXT,
  operator_name TEXT NOT NULL,
  traffic_type TEXT NOT NULL DEFAULT 'promotional',
  cost NUMERIC(12, 6) NOT NULL DEFAULT 0,
  sale_price NUMERIC(12, 6) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  tps INTEGER NOT NULL DEFAULT 1,
  quality_estimate TEXT NOT NULL DEFAULT 'unknown',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wholesale_routes_status_check CHECK (
    status IN ('draft', 'testing', 'approved', 'live', 'paused', 'rejected')
  ),
  CONSTRAINT wholesale_routes_traffic_type_check CHECK (
    traffic_type IN ('promotional', 'transactional', 'otp', 'mixed')
  ),
  CONSTRAINT wholesale_routes_quality_check CHECK (
    quality_estimate IN ('excellent', 'good', 'fair', 'poor', 'unknown')
  )
);

CREATE INDEX IF NOT EXISTS idx_wholesale_routes_provider
  ON wholesale_routes (provider_id);

CREATE INDEX IF NOT EXISTS idx_wholesale_routes_country_status
  ON wholesale_routes (country_code, status);

DROP TRIGGER IF EXISTS trg_wholesale_routes_updated_at ON wholesale_routes;
CREATE TRIGGER trg_wholesale_routes_updated_at
  BEFORE UPDATE ON wholesale_routes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ========== wholesale_rate_offers ==========

CREATE TABLE IF NOT EXISTS wholesale_rate_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES wholesale_providers (id) ON DELETE SET NULL,
  title TEXT,
  raw_text TEXT NOT NULL,
  country_code TEXT,
  parsed_notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wholesale_rate_offers_status_check CHECK (
    status IN ('draft', 'testing', 'approved', 'live', 'paused', 'rejected')
  )
);

CREATE INDEX IF NOT EXISTS idx_wholesale_rate_offers_provider
  ON wholesale_rate_offers (provider_id);

CREATE INDEX IF NOT EXISTS idx_wholesale_rate_offers_status
  ON wholesale_rate_offers (status);

DROP TRIGGER IF EXISTS trg_wholesale_rate_offers_updated_at ON wholesale_rate_offers;
CREATE TRIGGER trg_wholesale_rate_offers_updated_at
  BEFORE UPDATE ON wholesale_rate_offers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ========== wholesale_route_tests ==========

CREATE TABLE IF NOT EXISTS wholesale_route_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID REFERENCES wholesale_routes (id) ON DELETE SET NULL,
  provider_id UUID REFERENCES wholesale_providers (id) ON DELETE SET NULL,
  test_number TEXT,
  destination_country TEXT,
  notes TEXT,
  result_summary TEXT,
  delivery_status TEXT,
  tested_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wholesale_route_tests_status_check CHECK (
    status IN ('draft', 'testing', 'approved', 'live', 'paused', 'rejected')
  )
);

CREATE INDEX IF NOT EXISTS idx_wholesale_route_tests_route
  ON wholesale_route_tests (route_id);

CREATE INDEX IF NOT EXISTS idx_wholesale_route_tests_status
  ON wholesale_route_tests (status);

DROP TRIGGER IF EXISTS trg_wholesale_route_tests_updated_at ON wholesale_route_tests;
CREATE TRIGGER trg_wholesale_route_tests_updated_at
  BEFORE UPDATE ON wholesale_route_tests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ========== wholesale_customers ==========

CREATE TABLE IF NOT EXISTS wholesale_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  whatsapp TEXT,
  country_code TEXT NOT NULL DEFAULT 'CL',
  country_name TEXT,
  connection_type TEXT NOT NULL DEFAULT 'api',
  monthly_volume_estimate INTEGER,
  commercial_status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wholesale_customers_commercial_status_check CHECK (
    commercial_status IN ('draft', 'testing', 'approved', 'live', 'paused', 'rejected')
  ),
  CONSTRAINT wholesale_customers_connection_type_check CHECK (
    connection_type IN ('api', 'smpp', 'manual')
  )
);

CREATE INDEX IF NOT EXISTS idx_wholesale_customers_status
  ON wholesale_customers (commercial_status);

CREATE INDEX IF NOT EXISTS idx_wholesale_customers_country
  ON wholesale_customers (country_code);

DROP TRIGGER IF EXISTS trg_wholesale_customers_updated_at ON wholesale_customers;
CREATE TRIGGER trg_wholesale_customers_updated_at
  BEFORE UPDATE ON wholesale_customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ========== wholesale_opportunities ==========

CREATE TABLE IF NOT EXISTS wholesale_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES wholesale_customers (id) ON DELETE CASCADE,
  country_code TEXT,
  country_name TEXT,
  traffic_type TEXT NOT NULL DEFAULT 'promotional',
  volume_estimate INTEGER,
  target_price NUMERIC(12, 6),
  currency TEXT NOT NULL DEFAULT 'USD',
  commercial_status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wholesale_opportunities_commercial_status_check CHECK (
    commercial_status IN ('draft', 'testing', 'approved', 'live', 'paused', 'rejected')
  ),
  CONSTRAINT wholesale_opportunities_traffic_type_check CHECK (
    traffic_type IN ('promotional', 'transactional', 'otp', 'mixed')
  )
);

CREATE INDEX IF NOT EXISTS idx_wholesale_opportunities_customer
  ON wholesale_opportunities (customer_id);

CREATE INDEX IF NOT EXISTS idx_wholesale_opportunities_status
  ON wholesale_opportunities (commercial_status);

DROP TRIGGER IF EXISTS trg_wholesale_opportunities_updated_at ON wholesale_opportunities;
CREATE TRIGGER trg_wholesale_opportunities_updated_at
  BEFORE UPDATE ON wholesale_opportunities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
