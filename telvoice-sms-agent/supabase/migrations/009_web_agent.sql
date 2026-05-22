-- Agente comercial web Telvoice.cl (chat flotante)

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS web_agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_key TEXT NOT NULL,
  lead_capture_step TEXT,
  lead_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_quote JSONB,
  page_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_web_agent_sessions_visitor
  ON web_agent_sessions (visitor_key);

CREATE INDEX IF NOT EXISTS idx_web_agent_sessions_updated
  ON web_agent_sessions (updated_at DESC);

CREATE TABLE IF NOT EXISTS web_agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES web_agent_sessions (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_web_agent_messages_session
  ON web_agent_messages (session_id, created_at);

CREATE TABLE IF NOT EXISTS web_agent_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES web_agent_sessions (id) ON DELETE SET NULL,
  name TEXT,
  company TEXT,
  email TEXT,
  phone TEXT,
  requested_quantity INTEGER,
  message TEXT,
  source TEXT NOT NULL DEFAULT 'web_agent',
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_web_agent_leads_status
  ON web_agent_leads (status, created_at DESC);

CREATE TABLE IF NOT EXISTS web_agent_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES web_agent_sessions (id) ON DELETE SET NULL,
  requested_quantity INTEGER NOT NULL,
  quoted_quantity INTEGER NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
  subtotal INTEGER NOT NULL,
  iva INTEGER NOT NULL,
  total_with_iva INTEGER NOT NULL,
  tier_label TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CLP',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_web_agent_quotes_session
  ON web_agent_quotes (session_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_web_agent_sessions_updated_at ON web_agent_sessions;
CREATE TRIGGER trg_web_agent_sessions_updated_at
  BEFORE UPDATE ON web_agent_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
