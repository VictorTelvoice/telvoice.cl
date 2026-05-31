-- Conocimiento derivado de feedback negativo panel (mayo 2026)

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
    'Número de destino no autorizado en Telvoice',
    'soporte',
    ARRAY['autorizado', 'destino', 'numero', 'número', 'whitelist', 'error', 'envío', '569']::TEXT[],
    'Si el panel indica que el número de destino no está autorizado: usa formato 569XXXXXXXX; revisa límites de live test y números permitidos en tu cuenta; verifica tipo de SMS (P/T) y ruta Chile; si envías por API/SMPP confirma IP en whitelist. Revisa el detalle en /app/inbox o abre /app/support con el ID del mensaje.',
    ARRAY['web_client', 'telegram', 'admin']::TEXT[],
    'customer',
    14
  ),
  (
    'Cómo integrar la API de Telvoice con mi sistema',
    'panel_cliente',
    ARRAY['api', 'integrar', 'integración', 'sistema', 'credenciales', 'smpp', 'http']::TEXT[],
    'Para integrar Telvoice: solicita credenciales API y documentación a soporte; configura Sender ID autorizado; envía a números 569XXXXXXXX; para SMPP registra la IP del servidor en whitelist. Desde el panel puedes probar en /app/send-sms y revisar /app/inbox. El agente del panel también puede ayudarte con saldo y campañas.',
    ARRAY['web_client', 'telegram', 'admin']::TEXT[],
    'customer',
    13
  )
) AS v(title, category, keywords, content, allowed_channels, audience, priority)
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_articles ka WHERE ka.title = v.title
);
