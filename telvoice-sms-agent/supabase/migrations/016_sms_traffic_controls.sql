-- Etapa 11: Control operativo SMS — TPS, colas, límites (aditiva, sin RLS ni DROP)

-- Proveedor / vendor: capacidad upstream
ALTER TABLE sms_providers
  ADD COLUMN IF NOT EXISTS max_tps NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_concurrent_requests INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS daily_limit INTEGER,
  ADD COLUMN IF NOT EXISTS monthly_limit INTEGER,
  ADD COLUMN IF NOT EXISTS failure_threshold_percent NUMERIC NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS auto_pause_on_failure BOOLEAN NOT NULL DEFAULT false;

-- Ruta: capacidad por ruta
ALTER TABLE sms_routes
  ADD COLUMN IF NOT EXISTS max_tps NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_concurrent_requests INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS daily_limit INTEGER,
  ADD COLUMN IF NOT EXISTS failure_threshold_percent NUMERIC NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS auto_pause_on_failure BOOLEAN NOT NULL DEFAULT false;

-- Rate plan: política comercial base
ALTER TABLE sms_rate_plans
  ADD COLUMN IF NOT EXISTS default_tps NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS daily_limit INTEGER,
  ADD COLUMN IF NOT EXISTS monthly_limit INTEGER;

-- Cliente: lo que Telvoice permite por cuenta (max_tps ≤ 20)
ALTER TABLE company_rate_plans
  ADD COLUMN IF NOT EXISTS max_tps NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS daily_limit INTEGER,
  ADD COLUMN IF NOT EXISTS monthly_limit INTEGER,
  ADD COLUMN IF NOT EXISTS live_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS campaigns_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS api_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE company_rate_plans
  DROP CONSTRAINT IF EXISTS company_rate_plans_max_tps_cap;

ALTER TABLE company_rate_plans
  ADD CONSTRAINT company_rate_plans_max_tps_cap CHECK (max_tps <= 20);

-- Cola de envío (preparada; worker manual en esta etapa)
CREATE TABLE IF NOT EXISTS sms_send_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES sms_campaigns (id) ON DELETE SET NULL,
  message_id UUID REFERENCES panel_sms_messages (id) ON DELETE SET NULL,
  provider_id UUID REFERENCES sms_providers (id) ON DELETE SET NULL,
  route_id UUID REFERENCES sms_routes (id) ON DELETE SET NULL,
  rate_plan_id UUID REFERENCES sms_rate_plans (id) ON DELETE SET NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  traffic_type TEXT NOT NULL DEFAULT 'transactional',
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  processed_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sms_send_queue_status_check CHECK (
    status IN ('queued', 'processing', 'sent', 'failed', 'cancelled', 'paused')
  ),
  CONSTRAINT sms_send_queue_traffic_type_check CHECK (
    traffic_type IN ('transactional', 'otp', 'promotional', 'mixed')
  )
);

CREATE INDEX IF NOT EXISTS idx_sms_send_queue_status_scheduled
  ON sms_send_queue (status, scheduled_at)
  WHERE status IN ('queued', 'paused');

CREATE INDEX IF NOT EXISTS idx_sms_send_queue_company
  ON sms_send_queue (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_send_queue_route
  ON sms_send_queue (route_id, status);

CREATE INDEX IF NOT EXISTS idx_sms_send_queue_provider
  ON sms_send_queue (provider_id, status);

DROP TRIGGER IF EXISTS trg_sms_send_queue_updated_at ON sms_send_queue;
CREATE TRIGGER trg_sms_send_queue_updated_at
  BEFORE UPDATE ON sms_send_queue
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Contadores TPS persistentes (futuro Redis/DB; etapa 11 usa memoria por proceso)
CREATE TABLE IF NOT EXISTS sms_tps_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL,
  scope_id UUID,
  window_start TIMESTAMPTZ NOT NULL,
  window_seconds INTEGER NOT NULL DEFAULT 1,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sms_tps_counters_scope_check CHECK (
    scope IN ('company', 'provider', 'route', 'rate_plan', 'platform')
  )
);

CREATE INDEX IF NOT EXISTS idx_sms_tps_counters_scope_window
  ON sms_tps_counters (scope, scope_id, window_start DESC);

-- Ruta pausada operativamente (además de inactive/testing)
ALTER TABLE sms_routes DROP CONSTRAINT IF EXISTS sms_routes_status_check;
ALTER TABLE sms_routes
  ADD CONSTRAINT sms_routes_status_check CHECK (
    status IN ('active', 'inactive', 'testing', 'paused')
  );

COMMENT ON TABLE sms_send_queue IS 'Cola de envío SMS real — procesamiento manual/tick Superadmin en etapa 11';
COMMENT ON TABLE sms_tps_counters IS 'Ventanas TPS persistentes (opcional; limitación multi-instancia documentada en código)';
COMMENT ON COLUMN sms_providers.max_tps IS 'TPS máximo consumible desde este vendor/proveedor';
COMMENT ON COLUMN company_rate_plans.max_tps IS 'TPS máximo permitido al cliente (hard cap 20)';
