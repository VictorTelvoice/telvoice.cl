-- Manual panel, estrategia campañas e industrias — Agent Core

INSERT INTO knowledge_articles (title, category, keywords, content, allowed_channels, audience, priority)
SELECT v.title, v.category, v.keywords, v.content, v.allowed_channels, v.audience, v.priority
FROM (
  VALUES
    (
      'Cómo crear una campaña masiva',
      'panel_cliente',
      ARRAY['campaña masiva', 'crear campaña', 'envío masivo', 'panel']::TEXT[],
      'En /app/campaigns/new define nombre, Sender ID, mensaje y audiencia (lista o importación CSV). Revisa segmentos y costo estimado antes de lanzar.',
      ARRAY['web_client', 'admin']::TEXT[],
      'cliente',
      20
    ),
    (
      'Cómo preparar planilla CSV de contactos',
      'panel_cliente',
      ARRAY['csv', 'planilla', 'columnas', 'importar contactos']::TEXT[],
      'Columnas mínimas: teléfono móvil Chile (+569… o 9 dígitos). Opcional: nombre, email, etiquetas. Sin filas vacías en teléfono. Importa en /app/contacts/import.',
      ARRAY['web_client', 'telegram', 'admin']::TEXT[],
      'cliente',
      18
    ),
    (
      'Qué significa provider_status S y F',
      'dlr',
      ARRAY['provider_status', 'status s', 'status f', 'asmsc']::TEXT[],
      'En aSMSC: S = submitted/aceptado por el proveedor. F = fallo en envío o rechazo. No equivale a delivered al teléfono.',
      ARRAY['telegram', 'web_client', 'admin']::TEXT[],
      'soporte',
      25
    ),
    (
      'Estrategia SMS retail Chile',
      'estrategia',
      ARRAY['retail', 'tienda', 'descuento', 'campaña comercial']::TEXT[],
      'Mensajes cortos, CTA claro, horario comercial, personaliza con nombre. Evita spam; usa opt-in. 1 segmento GSM reduce costo.',
      ARRAY['web_client', 'landing', 'telegram']::TEXT[],
      'estrategia',
      10
    ),
    (
      'Estrategia SMS ecommerce',
      'estrategia',
      ARRAY['ecommerce', 'carrito', 'abandono', 'cyber']::TEXT[],
      'Carrito abandonado: urgencia + enlace corto. Confirma despacho y tracking por SMS transaccional.',
      ARRAY['web_client', 'landing']::TEXT[],
      'estrategia',
      10
    ),
    (
      'Estrategia SMS restaurantes',
      'estrategia',
      ARRAY['restaurante', 'delivery', 'reserva', 'comida']::TEXT[],
      'Reservas y promos del día en horario almuerzo/cena. Máx. 1 SMS/día por cliente en promos.',
      ARRAY['web_client', 'landing']::TEXT[],
      'estrategia',
      8
    ),
    (
      'Estrategia SMS salud',
      'estrategia',
      ARRAY['salud', 'clínica', 'recordatorio', 'cita médica']::TEXT[],
      'Solo recordatorios y confirmaciones con consentimiento. Sin diagnósticos sensibles por SMS.',
      ARRAY['web_client', 'admin']::TEXT[],
      'estrategia',
      8
    ),
    (
      'Estrategia SMS fintech y finanzas',
      'estrategia',
      ARRAY['fintech', 'finanzas', 'otp', 'transaccional']::TEXT[],
      'OTP y alertas transaccionales: mensaje breve, sin enlaces sospechosos, remitente reconocible.',
      ARRAY['web_client', 'landing', 'telegram']::TEXT[],
      'estrategia',
      12
    ),
    (
      'Precios y tramos Telvoice.cl (público)',
      'comercial',
      ARRAY['precio', 'tramos', 'iva', 'calculadora', 'cotizar', 'bolsa']::TEXT[],
      'Bolsas en múltiplos de 1.000 SMS (mín. 1.000). Tramos CL: 1k–4k $10+IVA/SMS; 5k–9k $9; 10k–14k $8; 15k–49k $7; 50k–99k $6; 100k+ $5+IVA/SMS. IVA 19%.',
      ARRAY['landing', 'telegram', 'web_client']::TEXT[],
      'comercial',
      30
    )
) AS v(title, category, keywords, content, allowed_channels, audience, priority)
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_articles ka WHERE ka.title = v.title
);
