-- Memoria conversacional y feedback del agente

CREATE TABLE IF NOT EXISTS agent_conversation_memory (
  session_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  company_id UUID REFERENCES companies (id) ON DELETE SET NULL,
  memory JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_agent_conversation_memory_updated
  ON agent_conversation_memory (updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL,
  session_id TEXT NOT NULL,
  user_id TEXT,
  company_id UUID REFERENCES companies (id) ON DELETE SET NULL,
  message_id UUID,
  rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  feedback_text TEXT,
  resolved BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_feedback_created
  ON agent_feedback (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_feedback_channel
  ON agent_feedback (channel, created_at DESC);

ALTER TABLE panel_agent_sessions
  ADD COLUMN IF NOT EXISTS conversation_memory JSONB NOT NULL DEFAULT '{}'::jsonb;
