-- Conocimiento comercial Telvoice.cl (Chile)

INSERT INTO knowledge_articles (title, category, keywords, content)
SELECT v.title, v.category, v.keywords, v.content
FROM (VALUES
  (
    'Qué es una bolsa de SMS',
    'comercial',
    ARRAY['bolsa', 'sms', 'prepago', 'comprar', 'chile']::TEXT[],
    'Una bolsa de SMS es una cantidad prepagada de mensajes que puedes comprar para enviar campañas, notificaciones o recordatorios a teléfonos en Chile.'
  ),
  (
    'Cómo funciona el envío de SMS masivos',
    'comercial',
    ARRAY['envio', 'masivos', 'panel', 'api', 'campañas']::TEXT[],
    'Puedes enviar SMS desde el panel web o mediante API REST, según el tipo de cuenta e integración. Para campañas, el cliente puede cargar su base de teléfonos, redactar el mensaje y gestionar el envío.'
  ),
  (
    'Qué operadores incluye Telvoice.cl',
    'comercial',
    ARRAY['operadores', 'entel', 'movistar', 'claro', 'wom', 'chile']::TEXT[],
    'Telvoice.cl cubre Entel, Movistar, Claro y WOM, con rutas orientadas al tráfico A2P en Chile.'
  ),
  (
    'Los SMS vencen',
    'comercial',
    ARRAY['vencen', 'vigencia', 'bolsa', 'condiciones']::TEXT[],
    'Las condiciones de uso y vigencia se informan al momento de comprar cada bolsa. Para alto volumen se pueden acordar condiciones especiales.'
  ),
  (
    'Telvoice tiene soporte en Chile',
    'comercial',
    ARRAY['soporte', 'chile', 'español', 'ayuda']::TEXT[],
    'Sí. Telvoice.cl opera para el mercado chileno y ofrece soporte comercial y técnico en español.'
  ),
  (
    'Cómo se emite factura',
    'comercial',
    ARRAY['factura', 'iva', 'electronica', 'clp']::TEXT[],
    'Telvoice.cl emite factura electrónica afecta a IVA en pesos chilenos.'
  ),
  (
    'Puedo enviar SMS desde mi propio sistema',
    'comercial',
    ARRAY['api', 'integracion', 'sistema', 'automatizar']::TEXT[],
    'Sí. Telvoice puede entregar integración vía API para empresas que necesitan automatizar envíos, sujeto a validación técnica y comercial.'
  ),
  (
    'Sirve para campañas promocionales',
    'comercial',
    ARRAY['promocional', 'campañas', 'marketing', 'bases autorizadas']::TEXT[],
    'Sí, siempre que la empresa utilice bases autorizadas y respete buenas prácticas de comunicación.'
  ),
  (
    'Puedo cotizar grandes volúmenes',
    'comercial',
    ARRAY['cotizar', 'alto volumen', '120000', 'mayor volumen']::TEXT[],
    'Sí. Para volúmenes superiores a 120.000 SMS, Telvoice.cl cotiza a $5 + IVA por SMS como cotización de alto volumen.'
  ),
  (
    'Telvoice.cl y Telvoice.net',
    'comercial',
    ARRAY['telvoice.net', 'internacional', 'mayorista', 'chile']::TEXT[],
    'Telvoice.cl está enfocado en el mercado chileno y en la compra simple de bolsas SMS. Telvoice.net representa la operación internacional y mayorista de Telvoice. No vendemos rutas internacionales desde Telvoice.cl.'
  ),
  (
    'Telvoice.cl enfoque comercial',
    'comercial',
    ARRAY['telvoice.cl', 'chile', 'bolsas', 'mercadopago', 'panel']::TEXT[],
    'Telvoice.cl vende SMS masivos para empresas en Chile: bolsas prepago, pago online con MercadoPago, panel web, API REST sujeta a validación y soporte en español. Cobertura Entel, Movistar, Claro y WOM.'
  ),
  (
    'Buenas prácticas SMS Telvoice.cl',
    'comercial',
    ARRAY['buenas practicas', 'spam', 'phishing', 'bases autorizadas']::TEXT[],
    'Telvoice.cl promueve campañas responsables. Se deben usar bases autorizadas. No se permite phishing, fraude, suplantación ni spam. Las campañas promocionales deben tener comunicación clara.'
  ),
  (
    'Casos de uso SMS retail',
    'comercial',
    ARRAY['retail', 'promociones', 'compra', 'tienda']::TEXT[],
    'Retail: promociones, seguimiento de compra y fidelización con SMS masivos en Chile.'
  ),
  (
    'Casos de uso SMS ecommerce',
    'comercial',
    ARRAY['ecommerce', 'carrito', 'cupones', 'despacho']::TEXT[],
    'E-commerce: recuperación de carritos, cupones y avisos de despacho por SMS.'
  ),
  (
    'Casos de uso SMS OTP y fintech',
    'comercial',
    ARRAY['otp', 'fintech', 'seguridad', 'transaccional']::TEXT[],
    'Fintech y aplicaciones: OTP y alertas transaccionales con tráfico tipo T, sujeto a habilitación.'
  ),
  (
    'Pago online MercadoPago Telvoice.cl',
    'comercial',
    ARRAY['mercadopago', 'pago', 'online', 'clp', 'comprar']::TEXT[],
    'Puedes pagar online mediante MercadoPago en pesos chilenos. Si tu bolsa tiene link de pago configurado, te enviamos el checkout directo.'
  )
) AS v(title, category, keywords, content)
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_articles ka WHERE ka.title = v.title
);
