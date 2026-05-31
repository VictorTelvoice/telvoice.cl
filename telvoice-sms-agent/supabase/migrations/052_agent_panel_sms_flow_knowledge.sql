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
    'Cómo enviar SMS desde el agente del panel cliente',
    'panel_cliente',
    ARRAY['agente', 'panel', 'enviar', 'sms', 'csv', 'campaña', 'confirmar']::TEXT[],
    'El agente del panel (/app) puede ayudarte a enviar un SMS individual o una campaña desde CSV. Primero te pedirá el mensaje, luego el número o planilla, calculará el crédito requerido y solicitará que respondas Confirmo antes de enviar usando el saldo de tu cuenta.',
    ARRAY['web_client', 'admin']::TEXT[],
    'customer',
    15
  )
) AS v(title, category, keywords, content, allowed_channels, audience, priority)
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_articles
  WHERE title = 'Cómo enviar SMS desde el agente del panel cliente'
);
