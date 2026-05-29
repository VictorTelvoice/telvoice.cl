-- FAQ panel cliente — Telvoice Agent Core

INSERT INTO knowledge_articles (title, category, keywords, content)
SELECT v.title, v.category, v.keywords, v.content
FROM (
  VALUES
    (
      'Cómo crear una campaña en el panel',
      'panel_cliente',
      ARRAY['campaña', 'crear campaña', 'nueva campaña', 'panel', 'envío masivo']::TEXT[],
      'En /app/campaigns/new define nombre, Sender ID, mensaje y audiencia (lista de contactos o CSV). Revisa el preview de segmentos y costo estimado. Guarda borrador o lanza cuando tengas saldo suficiente.'
    ),
    (
      'Cómo cargar contactos',
      'panel_cliente',
      ARRAY['contactos', 'importar', 'csv', 'lista', 'cargar contactos']::TEXT[],
      'Ve a /app/contacts para crear listas y contactos manualmente, o /app/contacts/import para subir CSV. Valida que los móviles estén en formato +569XXXXXXXX. Asigna etiquetas para segmentar.'
    ),
    (
      'Cómo revisar reportes del panel',
      'panel_cliente',
      ARRAY['reportes', 'métricas', 'consumo', 'dashboard']::TEXT[],
      'En /app/reports ves SMS simulados vs reales, entregados y consumo por día. El dashboard resume saldo, envíos del mes y tasas de entrega.'
    ),
    (
      'Cómo interpretar DLR en la bandeja',
      'panel_cliente',
      ARRAY['dlr', 'delivered', 'submitted', 'failed', 'estado', 'bandeja']::TEXT[],
      'En /app/inbox cada fila muestra estado y modo. submitted/sent: aceptado por el proveedor. delivered: llegó al teléfono. failed: revisa número, contenido o bloqueo. Los eventos DLR detallados quedan en metadata del mensaje.'
    ),
    (
      'Optimizar mensajes para menos segmentos',
      'panel_cliente',
      ARRAY['segmentos', 'gsm', 'ucs2', 'acortar', 'optimizar mensaje']::TEXT[],
      'Usa GSM-7 cuando puedas (evita emojis y caracteres raros). Mensajes ≤160 caracteres GSM suelen ser 1 segmento. Revisa el contador en Enviar SMS antes de lanzar campañas grandes.'
    ),
    (
      'Cómo comprar más SMS en el panel',
      'panel_cliente',
      ARRAY['comprar', 'bolsa', 'saldo', 'mercadopago', 'recargar']::TEXT[],
      'Entra a /app/buy-sms, elige una bolsa activa y paga con MercadoPago si está habilitado. Tras acreditación el saldo sube en /app/wallet.'
    ),
    (
      'Calculadora y tramos de precio Telvoice.cl',
      'panel_cliente',
      ARRAY['precio', 'tramos', 'calculadora', 'iva', 'cotizar']::TEXT[],
      'Las bolsas se cotizan en múltiplos de 1.000 SMS (mínimo 1.000). Tramos Chile: 1k–4k $10+IVA/SMS; 5k–9k $9; 10k–14k $8; 15k–49k $7; 50k–90k $6; 100k–120k $5; sobre 120k cotizar a $5+IVA/SMS.'
    ),
    (
      'Qué hacer si un SMS queda failed',
      'panel_cliente',
      ARRAY['failed', 'fallido', 'error', 'no entregado']::TEXT[],
      'Revisa el número (+569…), que el Sender ID sea válido y que el texto no viole políticas. Si fue live_test, confirma número autorizado. Abre ticket en /app/support si persiste.'
    ),
    (
      'Buenas prácticas campañas comerciales Chile',
      'panel_cliente',
      ARRAY['buenas prácticas', 'opt-in', 'spam', 'chile', 'comercial']::TEXT[],
      'Usa bases con consentimiento, identifica tu marca en el SMS, ofrece baja clara y evita horarios nocturnos. No prometas premios engañosos ni enlaces sospechosos.'
    ),
    (
      'Manual de uso del panel cliente',
      'panel_cliente',
      ARRAY['manual', 'ayuda', 'panel', 'tutorial', 'guía']::TEXT[],
      'El manual PDF está en /app/support/manual. Incluye saldo, envíos, campañas, contactos, API y soporte. El asistente flotante puede resolver dudas rápidas sin salir del panel.'
    )
) AS v(title, category, keywords, content)
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_articles ka WHERE ka.title = v.title
);
