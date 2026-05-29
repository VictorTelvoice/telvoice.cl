-- Canales y audiencia para knowledge_articles

ALTER TABLE knowledge_articles
  ADD COLUMN IF NOT EXISTS allowed_channels TEXT[] NOT NULL DEFAULT ARRAY['telegram', 'landing', 'web_client', 'admin']::TEXT[];

ALTER TABLE knowledge_articles
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'general';

ALTER TABLE knowledge_articles
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_channels
  ON knowledge_articles USING GIN (allowed_channels);

UPDATE knowledge_articles
SET allowed_channels = ARRAY['telegram', 'landing', 'web_client', 'admin']::TEXT[]
WHERE allowed_channels IS NULL OR cardinality(allowed_channels) = 0;
