-- Etapa 10.1: Modelo telco — proveedores, rutas, rate plans (sin credenciales en BD)

CREATE TABLE IF NOT EXISTS sms_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'http_api',
  status TEXT NOT NULL DEFAULT 'active',
  api_base_url TEXT,
  auth_type TEXT NOT NULL DEFAULT 'env',
  default_sender_id TEXT,
  supports_dlr BOOLEAN NOT NULL DEFAULT true,
  supports_unicode BOOLEAN NOT NULL DEFAULT true,
  supports_flash BOOLEAN NOT NULL DEFAULT false,
  priority INTEGER NOT NULL DEFAULT 100,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sms_providers_status_check CHECK (
    status IN ('active', 'testing', 'degraded', 'suspended', 'inactive')
  ),
  CONSTRAINT sms_providers_type_check CHECK (
    type IN ('http_api', 'smpp', 'mock')
  )
);

CREATE INDEX IF NOT EXISTS idx_sms_providers_status ON sms_providers (status);
CREATE INDEX IF NOT EXISTS idx_sms_providers_code ON sms_providers (code);

DROP TRIGGER IF EXISTS trg_sms_providers_updated_at ON sms_providers;
CREATE TRIGGER trg_sms_providers_updated_at
  BEFORE UPDATE ON sms_providers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS sms_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES sms_providers (id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'CL',
  mcc TEXT,
  mnc TEXT,
  operator_name TEXT,
  route_type TEXT NOT NULL DEFAULT 'hq',
  traffic_type TEXT NOT NULL DEFAULT 'transactional',
  status TEXT NOT NULL DEFAULT 'active',
  priority INTEGER NOT NULL DEFAULT 100,
  cost_per_sms NUMERIC(12, 4) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  dlr_enabled BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sms_routes_status_check CHECK (
    status IN ('active', 'inactive', 'testing')
  ),
  CONSTRAINT sms_routes_route_type_check CHECK (
    route_type IN ('direct', 'hq', 'economy', 'backup', 'promotional', 'transactional')
  ),
  CONSTRAINT sms_routes_traffic_type_check CHECK (
    traffic_type IN ('transactional', 'promotional', 'otp', 'mixed')
  )
);

CREATE INDEX IF NOT EXISTS idx_sms_routes_provider ON sms_routes (provider_id);
CREATE INDEX IF NOT EXISTS idx_sms_routes_country_default ON sms_routes (country, is_default)
  WHERE status = 'active';

DROP TRIGGER IF EXISTS trg_sms_routes_updated_at ON sms_routes;
CREATE TRIGGER trg_sms_routes_updated_at
  BEFORE UPDATE ON sms_routes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS sms_rate_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL DEFAULT 'CLP',
  status TEXT NOT NULL DEFAULT 'active',
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sms_rate_plans_status_check CHECK (status IN ('active', 'inactive'))
);

DROP TRIGGER IF EXISTS trg_sms_rate_plans_updated_at ON sms_rate_plans;
CREATE TRIGGER trg_sms_rate_plans_updated_at
  BEFORE UPDATE ON sms_rate_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS sms_rate_plan_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_plan_id UUID NOT NULL REFERENCES sms_rate_plans (id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES sms_routes (id) ON DELETE RESTRICT,
  country TEXT NOT NULL DEFAULT 'CL',
  mcc TEXT,
  mnc TEXT,
  operator_name TEXT,
  traffic_type TEXT NOT NULL DEFAULT 'transactional',
  sell_price_per_sms NUMERIC(12, 4) NOT NULL,
  cost_price_per_sms NUMERIC(12, 4) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CLP',
  margin NUMERIC(12, 4) GENERATED ALWAYS AS (sell_price_per_sms - cost_price_per_sms) STORED,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sms_rate_plan_details_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX IF NOT EXISTS idx_sms_rate_plan_details_plan ON sms_rate_plan_details (rate_plan_id);
CREATE INDEX IF NOT EXISTS idx_sms_rate_plan_details_route ON sms_rate_plan_details (route_id);

DROP TRIGGER IF EXISTS trg_sms_rate_plan_details_updated_at ON sms_rate_plan_details;
CREATE TRIGGER trg_sms_rate_plan_details_updated_at
  BEFORE UPDATE ON sms_rate_plan_details
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS company_rate_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  rate_plan_id UUID NOT NULL REFERENCES sms_rate_plans (id) ON DELETE RESTRICT,
  country TEXT NOT NULL DEFAULT 'CL',
  traffic_type TEXT NOT NULL DEFAULT 'transactional',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT company_rate_plans_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_rate_plans_active
  ON company_rate_plans (company_id, country, traffic_type)
  WHERE status = 'active';

DROP TRIGGER IF EXISTS trg_company_rate_plans_updated_at ON company_rate_plans;
CREATE TRIGGER trg_company_rate_plans_updated_at
  BEFORE UPDATE ON company_rate_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE sms_providers IS 'Proveedores upstream (credenciales solo en .env)';
COMMENT ON TABLE sms_routes IS 'Route Manager — rutas por país/operador/proveedor';
COMMENT ON TABLE sms_rate_plans IS 'Planes tarifarios comerciales';
COMMENT ON TABLE sms_rate_plan_details IS 'Tarifa venta/costo por ruta dentro de un plan';
COMMENT ON TABLE company_rate_plans IS 'Asignación rate plan → empresa cliente';
