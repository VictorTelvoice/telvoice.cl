-- Flujo de revisión admin sobre agent_feedback (idempotente)

ALTER TABLE agent_feedback
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';

ALTER TABLE agent_feedback
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE agent_feedback
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

ALTER TABLE agent_feedback
  ADD COLUMN IF NOT EXISTS proposed_answer TEXT;

ALTER TABLE agent_feedback
  ADD COLUMN IF NOT EXISTS knowledge_article_id UUID
    REFERENCES knowledge_articles (id) ON DELETE SET NULL;

ALTER TABLE agent_feedback
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE agent_feedback
  ADD COLUMN IF NOT EXISTS user_message_id UUID;

ALTER TABLE agent_feedback
  ADD COLUMN IF NOT EXISTS agent_message_id UUID;

ALTER TABLE agent_feedback
  ADD COLUMN IF NOT EXISTS detected_intent TEXT;

ALTER TABLE agent_feedback
  ADD COLUMN IF NOT EXISTS confidence NUMERIC;

DO $$
BEGIN
  ALTER TABLE agent_feedback
    ADD CONSTRAINT agent_feedback_status_check
    CHECK (status IN ('new', 'reviewed', 'converted_to_article', 'ignored'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE agent_feedback
SET status = CASE
  WHEN resolved IS TRUE THEN 'reviewed'
  WHEN resolved IS FALSE AND rating IS NOT NULL AND rating <= 2 THEN 'new'
  ELSE COALESCE(status, 'new')
END
WHERE status IS NULL OR status = 'new';

CREATE INDEX IF NOT EXISTS idx_agent_feedback_status
  ON agent_feedback (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_feedback_company
  ON agent_feedback (company_id, created_at DESC)
  WHERE company_id IS NOT NULL;
