-- Agente asistente del panel cliente (Telvoice Agent Core — canal web_client)

CREATE TABLE IF NOT EXISTS panel_agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  user_id UUID REFERENCES admin_users (id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('web_client', 'telegram', 'landing', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_panel_agent_sessions_company
  ON panel_agent_sessions (company_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS panel_agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES panel_agent_sessions (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_panel_agent_messages_session
  ON panel_agent_messages (session_id, created_at);

DROP TRIGGER IF EXISTS trg_panel_agent_sessions_updated_at ON panel_agent_sessions;
CREATE TRIGGER trg_panel_agent_sessions_updated_at
  BEFORE UPDATE ON panel_agent_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
