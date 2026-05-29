-- Panel cliente: envío SMS desde agente; Telegram sin artículo en web_client

UPDATE knowledge_articles
SET allowed_channels = ARRAY['telegram', 'admin']::TEXT[]
WHERE title = 'Cómo enviar SMS por Telegram'
   OR title ILIKE '%enviar SMS por Telegram%';

INSERT INTO knowledge_articles (
  title,
  category,
  keywords,
  content,
  allowed_channels,
  audience,
  priority
)
SELECT
  v.title,
  v.category,
  v.keywords,
  v.content,
  v.allowed_channels,
  v.audience,
  v.priority
FROM (
  VALUES (
    'Cómo enviar SMS desde el panel cliente',
    'panel_cliente',
    ARRAY['panel', 'cliente', 'enviar', 'sms', 'agente', 'confirmar', 'web']::TEXT[],
    'Desde /app puedes enviar SMS individuales en Enviar SMS o pedirlo al agente del panel: indica número (569XXXXXXXX) y mensaje; el agente mostrará costo estimado y pedirá que respondas Confirmo antes de enviar usando el saldo de tu cuenta.',
    ARRAY['web_client', 'telegram', 'admin']::TEXT[],
    'client',
    12
  )
) AS v(title, category, keywords, content, allowed_channels, audience, priority)
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_articles
  WHERE title = 'Cómo enviar SMS desde el panel cliente'
);
