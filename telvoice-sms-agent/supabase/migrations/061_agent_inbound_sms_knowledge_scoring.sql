-- Fase 1.1: ajuste scoring knowledge SMS entrantes (keywords, content, priority)
-- Actualiza artículos creados por 060_agent_inbound_sms_knowledge.sql — no inserta duplicados.
-- Idempotente: UPDATE con estado final explícito (re-ejecutar produce el mismo resultado).

-- 1) Diferencia bandeja saliente vs SMS entrantes / DLR
UPDATE knowledge_articles
SET
  priority = 22,
  keywords = ARRAY[
    'sms saliente',
    'sms entrante',
    'dlr',
    'entregado',
    'recibido',
    'submitted',
    'delivered',
    'diferencia',
    'bandeja',
    'bandeja no es sms entrantes',
    'diferencia bandeja sms entrantes',
    'app inbox vs app sms inbox',
    '/app/inbox',
    '/app/sms-inbox',
    'bandeja saliente',
    'bandeja entrante',
    'dlr vs sms recibido',
    'recibido no es entregado',
    'bandeja es lo mismo que sms entrantes',
    'la bandeja es lo mismo que sms entrantes',
    'cual es la diferencia entre la bandeja y sms entrantes',
    'que diferencia hay entre app inbox y app sms inbox'
  ]::TEXT[],
  content = 'Son tres conceptos distintos que no deben mezclarse:

• SMS saliente: mensaje que tu empresa envía desde Telvoice hacia un móvil o destino. Lo gestionas en Enviar SMS, campañas o API.

• DLR (Delivery Report): reporte técnico de entrega de un SMS saliente (por ejemplo submitted, delivered o failed). Lo revisas en /app/inbox, la bandeja de envíos salientes.

• SMS entrante: respuesta o mensaje que una persona o sistema envía hacia tu numeración Telvoice. Lo revisas en /app/sms-inbox, la bandeja SMS entrantes.

¿La bandeja es lo mismo que SMS entrantes? No. /app/inbox es la bandeja saliente (envíos que tú hiciste y sus DLR). /app/sms-inbox es la bandeja entrante (mensajes que recibes en tu numeración).

«Entregado» en DLR significa que un envío saliente llegó al teléfono destino. «Recibido» en SMS entrantes significa que alguien escribió a tu numeración. Recibido no es lo mismo que entregado.',
  updated_at = NOW()
WHERE title = 'Diferencia entre SMS saliente, DLR y SMS entrante'
  AND category = 'panel_cliente';

-- 2) Limitaciones del agente con SMS entrantes
UPDATE knowledge_articles
SET
  priority = 24,
  keywords = ARRAY[
    'agente',
    'limitaciones',
    'no puede',
    'inventar',
    'responder este sms',
    'responder sms recibido',
    'mostrar ultimos sms recibidos',
    'ultimos sms recibidos',
    'leer sms entrantes',
    'marcar leido',
    'borrar sms entrante',
    'el agente puede responder',
    'limitaciones agente sms entrantes',
    'no puede responder sms',
    'no puede leer mensajes recibidos todavia',
    'puedes responder este sms',
    'puedes responder este sms por mi',
    'el agente puede mostrarme mis ultimos sms recibidos',
    'puedes leer mis sms entrantes',
    'puedes marcar leido este mensaje',
    'puedes borrar este sms'
  ]::TEXT[],
  content = 'El asistente del panel, respecto a SMS entrantes, hoy puede orientarte y explicar el módulo, pero no reemplaza la bandeja ni ejecuta acciones sobre mensajes recibidos. Esta fase es solo orientación.

En concreto:

• Todavía no lee directamente tus últimos SMS entrantes desde el chat. Si pides «muéstrame mis últimos SMS recibidos» o «lee mis SMS entrantes», debes revisar /app/sms-inbox en el panel.

• No puede inventar mensajes recibidos ni mostrar contenido que no tenga autorizado.

• No puede confirmar que llegó un SMS específico si no tiene acceso al dato en ese momento.

• No puede responder SMS entrantes en tu nombre (por ejemplo «responde este SMS por mí»). Cualquier envío futuro requeriría una función habilitada y confirmación explícita; no está disponible en esta fase.

• No puede borrar ni marcar mensajes como leídos desde el chat sin permiso.

• No debe mezclar DLR de envíos salientes (/app/inbox) con SMS entrantes (/app/sms-inbox).

Para ver mensajes reales, usa /app/sms-inbox.',
  updated_at = NOW()
WHERE title = 'Qué no puede hacer todavía el agente con SMS entrantes'
  AND category = 'panel_cliente';

-- 3) Webhook / API inbound
UPDATE knowledge_articles
SET
  priority = 20,
  keywords = ARRAY[
    'webhook inbound',
    'webhook',
    'api',
    'integracion',
    'telsim',
    'numeraciones',
    'number integrations',
    'sms entrantes webhook',
    'conectar sms entrantes por webhook',
    'recibir sms por api',
    'api inbound',
    'integrar sms recibidos',
    'mensajes recibidos webhook',
    'integraciones numeraciones',
    'reenviar sms recibido',
    'webhook numeracion',
    'hay webhook inbound',
    'como integro mensajes recibidos',
    'puedo enviar los sms recibidos a mi sistema'
  ]::TEXT[],
  content = '¿Puedo conectar SMS entrantes por webhook? Sí, según la configuración de cada numeración y la habilitación técnica disponible.

Puedes conectar SMS entrantes por webhook o integraciones según la configuración de cada numeración.

Telvoice registra mensajes entrantes en /app/sms-inbox cuando la línea recibe SMS en la red. Para reenviar esos mensajes a tu sistema (webhook inbound, API o integraciones), revisa Mis numeraciones (/app/numeraciones) y la sección de integraciones de cada línea (/app/numeraciones/:id/integraciones).

El reenvío automático hacia sistemas externos del cliente depende de la configuración disponible y de habilitación técnica: no asumas que un webhook externo ya está activo hasta validarlo con soporte o probar desde integraciones. El dispatcher completo puede requerir habilitación adicional.

La recepción en panel (/app/sms-inbox) es independiente del reenvío a tu backend. Consulta en Mis numeraciones qué opciones tiene tu numeración.',
  updated_at = NOW()
WHERE title = 'SMS entrantes por API o webhook'
  AND category = 'panel_cliente';

-- 4) Varias numeraciones (evitar colisión con «Número no autorizado»)
UPDATE knowledge_articles
SET
  priority = 21,
  keywords = ARRAY[
    'varios numeros',
    'varias numeraciones',
    'multiples numeros',
    'multiples numeraciones',
    'numero por area',
    'sim por agente',
    'numero dedicado por equipo',
    'varios numeros para recibir sms',
    'recibir sms en varios numeros',
    'puedo tener varios numeros',
    'puedo tener varias numeraciones',
    'puedo recibir sms en varios numeros',
    'numeracion por area',
    'varios numeros dedicados',
    'sms entrante',
    'numeraciones'
  ]::TEXT[],
  content = '¿Puedo tener varios números? Sí: una empresa puede tener varias numeraciones activas (distintas SIM, líneas o números dedicados por área, equipo o agente). Cada una puede recibir SMS entrantes de forma independiente.

En /app/numeraciones ves el listado; en /app/sms-inbox puedes filtrar o cambiar de numeración para revisar los mensajes de cada línea.

Esto no está relacionado con el error «número de destino no autorizado» al enviar SMS salientes: ese mensaje aplica a envíos, no a cuántas líneas puedes tener para recibir.

Contratar numeraciones adicionales depende de tu plan y disponibilidad comercial. El asistente puede orientarte; la gestión contractual se hace desde planes, soporte o tu ejecutivo Telvoice.',
  updated_at = NOW()
WHERE title = 'Varias numeraciones para recibir SMS'
  AND category = 'panel_cliente';

-- 5) Respuestas a campañas (no confundir con resumen campañas salientes)
UPDATE knowledge_articles
SET
  priority = 20,
  keywords = ARRAY[
    'respuestas campaña',
    'respuestas sms',
    'campaña sms',
    'confirmaciones',
    'comunicacion bidireccional',
    'sms entrante',
    'respuestas de campañas',
    'respuestas a mis campañas',
    'clientes responden campaña',
    'recibir respuestas campaña',
    'campaña con respuesta',
    'sms bidireccional campaña',
    'campañas con sms entrantes',
    'puedo recibir respuestas de mis campañas'
  ]::TEXT[],
  content = '¿Puedo recibir respuestas de mis campañas? Sí, puedes capturar respuestas a campañas, confirmaciones, consultas o validaciones si la numeración configurada para recibir está habilitada para SMS entrantes.

Flujo típico: envías una campaña saliente desde Telvoice; los destinatarios responden al número o canal acordado; esas respuestas aparecen en /app/sms-inbox asociadas a la numeración que las recibió.

Esto es distinto del resumen de campañas salientes o estados DLR: eso lo revisas en /app/campaigns, /app/reports o /app/inbox (bandeja saliente), no en SMS entrantes.

El asistente del panel no lee automáticamente esas respuestas en el chat: revísalas en /app/sms-inbox.

Telvoice no garantiza por sí solo que todos los operadores enruten respuestas al mismo remitente alfanumérico: confirma con soporte qué numeración usar para respuestas en tu caso.',
  updated_at = NOW()
WHERE title = 'Respuestas a campañas SMS'
  AND category = 'panel_cliente';

-- 6) Dónde ver (evitar que limitaciones robe «¿dónde veo los SMS que me responden?»)
UPDATE knowledge_articles
SET
  priority = 18,
  keywords = ARRAY[
    'donde ver sms',
    'sms recibidos',
    'bandeja entrante',
    'inbox entrante',
    '/app/sms-inbox',
    'bandeja sms',
    'respuestas sms',
    'donde veo los sms que me responden',
    'sms que me responden',
    'ver sms que me responden',
    'donde veo sms recibidos',
    'donde reviso sms entrantes'
  ]::TEXT[],
  content = 'Los mensajes entrantes se revisan en /app/sms-inbox (menú «SMS entrantes» del panel).

¿Dónde veo los SMS que me responden? En /app/sms-inbox, no en la bandeja saliente.

No confundas con /app/inbox: esa ruta es la bandeja de envíos salientes y estados DLR de mensajes que tú enviaste, no las respuestas que recibes en tu numeración.

Si acabas de enviar una campaña y quieres ver si alguien respondió, abre SMS entrantes. Si quieres saber si un envío saliente fue entregado, abre Bandeja (/app/inbox).',
  updated_at = NOW()
WHERE title = 'Dónde ver los SMS recibidos'
  AND category = 'panel_cliente';

-- 7) SIM real (evitar colisión con artículo de limitaciones)
UPDATE knowledge_articles
SET
  priority = 18,
  keywords = ARRAY[
    'sim real',
    'sim',
    'gsm',
    'numeracion movil',
    'sms entrante',
    'validacion sms',
    'linea movil',
    'puedo usar una sim real para recibir sms',
    'sim real para recibir sms',
    'usar sim real recibir sms',
    'recibir sms sim real'
  ]::TEXT[],
  updated_at = NOW()
WHERE title = 'SMS entrantes y SIM reales'
  AND category = 'panel_cliente';

-- =============================================================================
-- ROLLBACK (manual, staging): restaurar valores de 060 si fuera necesario
-- =============================================================================
-- UPDATE knowledge_articles SET priority = 16, keywords = ARRAY[...060...], content = '...' WHERE title = 'Diferencia entre SMS saliente, DLR y SMS entrante';
-- UPDATE knowledge_articles SET priority = 16, keywords = ARRAY[...060...], content = '...' WHERE title = 'Qué no puede hacer todavía el agente con SMS entrantes';
-- UPDATE knowledge_articles SET priority = 12, keywords = ARRAY[...060...], content = '...' WHERE title = 'SMS entrantes por API o webhook';
-- UPDATE knowledge_articles SET priority = 13, keywords = ARRAY[...060...], content = '...' WHERE title = 'Varias numeraciones para recibir SMS';
-- UPDATE knowledge_articles SET priority = 13, keywords = ARRAY[...060...], content = '...' WHERE title = 'Respuestas a campañas SMS';
