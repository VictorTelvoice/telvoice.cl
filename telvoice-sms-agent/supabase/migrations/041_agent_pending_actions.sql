-- Acciones pendientes del Telvoice Agent Core (confirmación explícita)

CREATE TABLE IF NOT EXISTS agent_pending_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL CHECK (channel IN ('telegram', 'landing', 'web_client', 'admin')),
  session_id TEXT NOT NULL,
  user_id TEXT,
  company_id UUID REFERENCES companies (id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_pending_actions_session
  ON agent_pending_actions (session_id, status);

CREATE INDEX IF NOT EXISTS idx_agent_pending_actions_company
  ON agent_pending_actions (company_id, status)
  WHERE company_id IS NOT NULL;
