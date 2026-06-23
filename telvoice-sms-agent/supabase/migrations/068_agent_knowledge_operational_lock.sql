-- Knowledge escalable: respuestas cortas y bloqueo durante flujos operativos

ALTER TABLE knowledge_articles
  ADD COLUMN IF NOT EXISTS content_short TEXT,
  ADD COLUMN IF NOT EXISTS answer_style TEXT DEFAULT 'short',
  ADD COLUMN IF NOT EXISTS trigger_intents TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS blocked_when_flow_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS related_articles UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN knowledge_articles.content_short IS 'Respuesta breve para panel cliente (máx ~500 chars)';
COMMENT ON COLUMN knowledge_articles.answer_style IS 'short | detailed | step_by_step | commercial | technical';
COMMENT ON COLUMN knowledge_articles.blocked_when_flow_active IS 'Si true, no mostrar durante flujos SMS/compra activos';

-- Poblar content_short desde primer párrafo para artículos inbound/SMS frecuentes
UPDATE knowledge_articles
SET content_short = LEFT(
  TRIM(SPLIT_PART(content, E'\n', 1)),
  480
)
WHERE content_short IS NULL
  AND is_active = true
  AND LENGTH(content) > 200;

-- Artículos operativos de campaña: no interrumpir flujos activos
UPDATE knowledge_articles
SET blocked_when_flow_active = true,
    answer_style = COALESCE(answer_style, 'short')
WHERE title ILIKE '%campaña%'
   OR title ILIKE '%campana%'
   OR title ILIKE '%SMS entrante%'
   OR title ILIKE '%entrantes%';
