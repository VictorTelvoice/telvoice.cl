-- Entrenamiento continuo: status ignored, metadata dedup, vínculo knowledge ↔ pregunta

ALTER TABLE agent_unanswered_questions
  DROP CONSTRAINT IF EXISTS agent_unanswered_questions_status_check;

ALTER TABLE agent_unanswered_questions
  ADD CONSTRAINT agent_unanswered_questions_status_check
  CHECK (status IN ('new', 'reviewed', 'ignored', 'dismissed'));

UPDATE agent_unanswered_questions
SET status = 'ignored'
WHERE status = 'dismissed';

ALTER TABLE agent_unanswered_questions
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE knowledge_articles
  ADD COLUMN IF NOT EXISTS source_unanswered_question_id UUID
  REFERENCES agent_unanswered_questions (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_source_unanswered
  ON knowledge_articles (source_unanswered_question_id)
  WHERE source_unanswered_question_id IS NOT NULL;
