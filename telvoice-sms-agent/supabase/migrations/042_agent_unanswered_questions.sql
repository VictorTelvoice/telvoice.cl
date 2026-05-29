-- Preguntas sin respuesta — entrenamiento continuo del agente

CREATE TABLE IF NOT EXISTS agent_unanswered_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL,
  session_id TEXT,
  user_id TEXT,
  company_id UUID REFERENCES companies (id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  normalized_question TEXT,
  detected_intent TEXT,
  confidence NUMERIC(5, 4),
  suggested_category TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewed', 'dismissed')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_unanswered_status
  ON agent_unanswered_questions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_unanswered_channel
  ON agent_unanswered_questions (channel, created_at DESC);
