-- =============================================================================
-- Numeraciones contratadas, SMS entrantes y planes del Agente Telvoice
-- Migración ADITIVA. NO activa RLS (mismo patrón que contacts/support).
-- El panel usa service_role vía getSupabase(); políticas RLS opcionales abajo.
-- =============================================================================

CREATE TABLE IF NOT EXISTS client_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  country_code TEXT,
  type TEXT NOT NULL DEFAULT 'sim_real',
  status TEXT NOT NULL DEFAULT 'pending_activation',
  provider TEXT,
  sim_slot TEXT,
  gateway_id TEXT,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  assigned_agent_id UUID,
  activated_at TIMESTAMPTZ,
  renewed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_numbers_type_check CHECK (
    type IN ('sim_real', 'fixed_line', 'virtual', 'other')
  ),
  CONSTRAINT client_numbers_status_check CHECK (
    status IN (
      'available',
      'reserved',
      'pending_activation',
      'active',
      'suspended',
      'cancelled'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_client_numbers_company
  ON client_numbers (company_id);

CREATE INDEX IF NOT EXISTS idx_client_numbers_company_status
  ON client_numbers (company_id, status);

CREATE INDEX IF NOT EXISTS idx_client_numbers_number
  ON client_numbers (number);

DROP TRIGGER IF EXISTS trg_client_numbers_updated_at ON client_numbers;
CREATE TRIGGER trg_client_numbers_updated_at
  BEFORE UPDATE ON client_numbers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE client_numbers IS
  'Numeraciones Telvoice contratadas por empresa (SIM real, red fija, etc.).';

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inbound_sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  client_number_id UUID NOT NULL REFERENCES client_numbers (id) ON DELETE CASCADE,
  to_number TEXT NOT NULL,
  from_number TEXT,
  body TEXT NOT NULL,
  detected_otp TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'received',
  source TEXT,
  raw_payload JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inbound_sms_messages_status_check CHECK (
    status IN ('received', 'read', 'archived', 'forwarded', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS idx_inbound_sms_company_received
  ON inbound_sms_messages (company_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbound_sms_number_received
  ON inbound_sms_messages (client_number_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbound_sms_from
  ON inbound_sms_messages (from_number)
  WHERE from_number IS NOT NULL;

COMMENT ON TABLE inbound_sms_messages IS
  'SMS entrantes recibidos en numeraciones contratadas.';

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS number_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  client_number_id UUID REFERENCES client_numbers (id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'inactive',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_success_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT number_integrations_type_check CHECK (
    type IN ('telegram', 'webhook', 'api')
  ),
  CONSTRAINT number_integrations_status_check CHECK (
    status IN ('active', 'inactive', 'error')
  )
);

CREATE INDEX IF NOT EXISTS idx_number_integrations_company
  ON number_integrations (company_id);

CREATE INDEX IF NOT EXISTS idx_number_integrations_number
  ON number_integrations (client_number_id)
  WHERE client_number_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_number_integrations_unique_type
  ON number_integrations (company_id, client_number_id, type)
  WHERE client_number_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_number_integrations_updated_at ON number_integrations;
CREATE TRIGGER trg_number_integrations_updated_at
  BEFORE UPDATE ON number_integrations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE number_integrations IS
  'Integraciones por numeración: Telegram, webhook, API.';

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_plan_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  monthly_price_clp INTEGER NOT NULL,
  included_number_id UUID REFERENCES client_numbers (id) ON DELETE SET NULL,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  starts_at TIMESTAMPTZ,
  renews_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_plan_subscriptions_plan_check CHECK (
    plan_code IN ('start', 'pro', 'business')
  ),
  CONSTRAINT agent_plan_subscriptions_status_check CHECK (
    status IN ('pending', 'active', 'suspended', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_agent_plan_subscriptions_company
  ON agent_plan_subscriptions (company_id);

CREATE INDEX IF NOT EXISTS idx_agent_plan_subscriptions_status
  ON agent_plan_subscriptions (company_id, status);

DROP TRIGGER IF EXISTS trg_agent_plan_subscriptions_updated_at ON agent_plan_subscriptions;
CREATE TRIGGER trg_agent_plan_subscriptions_updated_at
  BEFORE UPDATE ON agent_plan_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE agent_plan_subscriptions IS
  'Suscripciones activas a planes del Agente Telvoice.';

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_plan_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL,
  preferred_number_type TEXT NOT NULL DEFAULT 'either',
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_plan_requests_plan_check CHECK (
    plan_code IN ('start', 'pro', 'business')
  ),
  CONSTRAINT agent_plan_requests_number_type_check CHECK (
    preferred_number_type IN ('sim_real', 'fixed_line', 'either')
  ),
  CONSTRAINT agent_plan_requests_status_check CHECK (
    status IN ('pending', 'reviewing', 'approved', 'rejected', 'activated')
  )
);

CREATE INDEX IF NOT EXISTS idx_agent_plan_requests_company
  ON agent_plan_requests (company_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_agent_plan_requests_updated_at ON agent_plan_requests;
CREATE TRIGGER trg_agent_plan_requests_updated_at
  BEFORE UPDATE ON agent_plan_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE agent_plan_requests IS
  'Solicitudes de contratación de planes del Agente Telvoice.';

-- ---------------------------------------------------------------------------
-- RLS (opcional — NO habilitado por defecto)
-- ALTER TABLE client_numbers ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY client_numbers_select_own ON client_numbers
--   FOR SELECT USING (
--     company_id IN (
--       SELECT company_id FROM user_profiles
--       WHERE user_id = auth.uid() AND status = 'active'
--     )
--   );
-- ---------------------------------------------------------------------------
