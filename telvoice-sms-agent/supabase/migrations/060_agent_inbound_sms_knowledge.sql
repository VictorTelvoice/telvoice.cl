-- Knowledge panel cliente: recepción SMS entrantes (Fase 1 agente conversacional)
-- Solo web_client y admin; no landing público.

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
  VALUES
    (
      'Qué es la recepción de SMS entrantes en Telvoice',
      'panel_cliente',
      ARRAY['sms entrante', 'sms recibidos', 'recibir sms', 'recepcion sms', 'numeracion', 'comunicacion bidireccional']::TEXT[],
      'La recepción de SMS entrantes permite recibir mensajes enviados por clientes, usuarios, sistemas, trabajadores o agentes hacia una numeración Telvoice asignada a tu empresa. Es el canal inverso al envío masivo: en lugar de salir desde Telvoice, el mensaje llega a tu línea contratada y queda disponible en la bandeja SMS entrantes del panel. Requiere una numeración activa habilitada para recepción.',
      ARRAY['web_client', 'admin']::TEXT[],
      'client',
      14
    ),
    (
      'Diferencia entre SMS saliente, DLR y SMS entrante',
      'panel_cliente',
      ARRAY['sms saliente', 'sms entrante', 'dlr', 'entregado', 'recibido', 'submitted', 'delivered', 'diferencia', 'bandeja']::TEXT[],
      'Son tres conceptos distintos que no deben mezclarse:

• SMS saliente: mensaje que tu empresa envía desde Telvoice hacia un móvil o destino. Lo gestionas en Enviar SMS, campañas o API.

• DLR (Delivery Report): reporte técnico de entrega de un SMS saliente (por ejemplo submitted, delivered o failed). Lo revisas en /app/inbox, la bandeja de envíos salientes.

• SMS entrante: respuesta o mensaje que una persona o sistema envía hacia tu numeración Telvoice. Lo revisas en /app/sms-inbox, la bandeja SMS entrantes.

«Entregado» en DLR significa que un envío saliente llegó al teléfono destino. «Recibido» en SMS entrantes significa que alguien escribió a tu numeración.',
      ARRAY['web_client', 'admin']::TEXT[],
      'client',
      16
    ),
    (
      'Dónde ver los SMS recibidos',
      'panel_cliente',
      ARRAY['donde ver sms', 'sms recibidos', 'bandeja entrante', 'inbox entrante', '/app/sms-inbox', 'bandeja sms', 'respuestas sms']::TEXT[],
      'Los mensajes entrantes se revisan en /app/sms-inbox (menú «SMS entrantes» del panel).

No confundas con /app/inbox: esa ruta es la bandeja de envíos salientes y estados DLR de mensajes que tú enviaste, no las respuestas que recibes en tu numeración.

Si acabas de enviar una campaña y quieres ver si alguien respondió, abre SMS entrantes. Si quieres saber si un envío saliente fue entregado, abre Bandeja (/app/inbox).',
      ARRAY['web_client', 'admin']::TEXT[],
      'client',
      16
    ),
    (
      'Numeraciones para recibir SMS',
      'panel_cliente',
      ARRAY['numeraciones', 'numero dedicado', 'sim real', 'recibir sms', 'numeracion activa', 'linea', 'sim']::TEXT[],
      'La recepción depende de tener una numeración activa contratada y configurada en Telvoice. Puede ser una SIM real con numeración móvil, un número dedicado o una línea empresarial según el plan contratado.

Gestiona tus líneas en /app/numeraciones: ahí ves el estado de cada numeración, si está activa y las opciones de integración. Sin numeración activa habilitada para recepción, no habrá mensajes entrantes en /app/sms-inbox.

Si contrataste un plan con línea y aún no ves la numeración, revisa el estado en Mis numeraciones o contacta soporte desde /app/support.',
      ARRAY['web_client', 'admin']::TEXT[],
      'client',
      14
    ),
    (
      'Respuestas a campañas SMS',
      'panel_cliente',
      ARRAY['respuestas campaña', 'respuestas sms', 'campaña sms', 'confirmaciones', 'comunicacion bidireccional', 'sms entrante']::TEXT[],
      'Puedes usar la recepción SMS para capturar respuestas a campañas, confirmaciones, consultas o validaciones, siempre que la numeración remitente o la línea configurada para recibir esté habilitada para SMS entrantes.

Flujo típico: envías una campaña saliente desde Telvoice; los destinatarios responden al número o canal acordado; esas respuestas aparecen en /app/sms-inbox asociadas a la numeración que las recibió.

Telvoice no garantiza por sí solo que todos los operadores enruten respuestas al mismo remitente alfanumérico: confirma con soporte qué numeración usar para respuestas en tu caso.',
      ARRAY['web_client', 'admin']::TEXT[],
      'client',
      13
    ),
    (
      'Casos de uso de SMS entrantes',
      'panel_cliente',
      ARRAY['casos de uso', 'sms entrante', 'confirmaciones', 'encuestas', 'soporte', 'validacion sms', 'operacional', 'codigos', 'empresa cliente']::TEXT[],
      'Los SMS entrantes son útiles para:

• Confirmaciones (citas, pedidos, asistencia)
• Encuestas simples de una respuesta
• Soporte y consultas de clientes
• Validaciones y verificaciones operativas
• Respuestas a campañas comerciales o informativas
• Comunicación operacional con equipos de campo
• Recepción de códigos o referencias enviados por usuarios
• Comunicación con equipos críticos (TI, gerencia, turnos)
• Canal formal empresa–cliente fuera de redes sociales

Todos requieren numeración activa y revisión en /app/sms-inbox.',
      ARRAY['web_client', 'admin']::TEXT[],
      'client',
      12
    ),
    (
      'Seguridad y privacidad en SMS entrantes',
      'panel_cliente',
      ARRAY['seguridad', 'privacidad', 'sms entrante', 'empresa', 'confidencial', 'multi tenant']::TEXT[],
      'Los SMS entrantes son datos privados de tu empresa. Solo usuarios autorizados del panel deben acceder a /app/sms-inbox de la cuenta correspondiente.

El asistente del panel no debe mostrar contenido de mensajes entrantes que no esté autorizado para la empresa actual, ni inventar mensajes recibidos. Si preguntas por SMS recibidos y el asistente aún no tiene acceso a esos datos, te orientará a la bandeja SMS entrantes en lugar de fabricar respuestas.

No compartas capturas de SMS entrantes con terceros si contienen datos personales de tus clientes o trabajadores.',
      ARRAY['web_client', 'admin']::TEXT[],
      'client',
      15
    ),
    (
      'SMS entrantes y SIM reales',
      'panel_cliente',
      ARRAY['sim real', 'sim', 'gsm', 'numeracion movil', 'sms entrante', 'validacion sms', 'linea movil']::TEXT[],
      'Una SIM real Telvoice permite trabajar con numeración móvil sobre infraestructura GSM/SMS. Es útil para flujos empresariales que requieren un número móvil dedicado, validaciones por SMS o recepción fuera de canales sociales.

La SIM debe estar activada y asociada a tu empresa en Mis numeraciones (/app/numeraciones). Una vez activa, los SMS que lleguen a esa línea se registran en /app/sms-inbox.

La disponibilidad de SIM y planes depende de contratación y activación; no asumas recepción hasta ver la numeración activa en el panel.',
      ARRAY['web_client', 'admin']::TEXT[],
      'client',
      13
    ),
    (
      'SMS entrantes por API o webhook',
      'panel_cliente',
      ARRAY['webhook inbound', 'webhook', 'api', 'integracion', 'telsim', 'numeraciones', 'number_integrations']::TEXT[],
      'Telvoice puede registrar mensajes entrantes en la bandeja del panel cuando la numeración recibe SMS en la red o mediante integraciones configuradas.

En /app/numeraciones puedes revisar integraciones por línea (por ejemplo webhook o Telegram). El reenvío automático hacia sistemas externos del cliente depende de la configuración disponible y de habilitación técnica: no asumas que un webhook externo ya está activo hasta validarlo con soporte o probar desde integraciones.

La recepción en panel (/app/sms-inbox) es independiente del reenvío a tu backend. Consulta en Mis numeraciones qué opciones tiene tu numeración.',
      ARRAY['web_client', 'admin']::TEXT[],
      'client',
      12
    ),
    (
      'Qué no puede hacer todavía el agente con SMS entrantes',
      'panel_cliente',
      ARRAY['agente', 'limitaciones', 'sms entrante', 'no puede', 'responder sms', 'inventar', 'dlr']::TEXT[],
      'El asistente del panel, respecto a SMS entrantes, hoy puede orientarte y explicar el módulo, pero no reemplaza la bandeja ni ejecuta acciones sobre mensajes recibidos. En concreto:

• No puede inventar mensajes recibidos ni mostrar contenido que no tenga autorizado.
• No puede confirmar que llegó un SMS específico si no tiene acceso al dato en ese momento.
• No puede responder SMS en tu nombre sin una función habilitada y confirmación explícita (no disponible en esta fase).
• No puede borrar ni marcar mensajes como leídos desde el chat.
• No debe mezclar DLR de envíos salientes (/app/inbox) con SMS entrantes (/app/sms-inbox).

Para ver mensajes reales, usa /app/sms-inbox.',
      ARRAY['web_client', 'admin']::TEXT[],
      'client',
      16
    ),
    (
      'Cómo usar la bandeja SMS entrantes',
      'panel_cliente',
      ARRAY['bandeja sms', 'bandeja entrante', '/app/sms-inbox', 'filtros', 'simulacion', 'numeracion activa', 'inbox entrante']::TEXT[],
      'Pasos básicos:

1. Entra a /app/sms-inbox (SMS entrantes) desde el menú del panel.
2. Selecciona la numeración activa si tienes más de una línea.
3. Revisa la lista de mensajes recibidos: remitente, texto, fecha y estado.
4. Usa filtros o búsqueda si están disponibles para encontrar un mensaje.
5. Distingue simulación de mensajes reales: las pruebas de simulación sirven para validar el flujo; un mensaje real proviene de un envío externo hacia tu numeración activa.

Si la bandeja está vacía, confirma en /app/numeraciones que la línea esté activa y que el remitente escribió al número correcto.',
      ARRAY['web_client', 'admin']::TEXT[],
      'client',
      14
    ),
    (
      'SMS entrantes para agentes IA y operación empresarial',
      'panel_cliente',
      ARRAY['agentes ia', 'operacion empresarial', 'canal movil', 'validacion', 'equipos criticos', 'formal', 'campañas sms']::TEXT[],
      'La recepción SMS entrante complementa el envío masivo y aporta un canal directo por red móvil para operación empresarial:

• Comunicación formal fuera de WhatsApp o redes sociales
• Validación de procesos con respuesta por SMS
• Soporte a agentes IA, bots o flujos que necesitan un número móvil real
• Coordinación con TI, gerentes y equipos críticos
• Captura de respuestas post-campaña

Telvoice registra los entrantes en el panel; la automatización avanzada (respuesta automática, IA sobre cada SMS) requiere integraciones adicionales según tu plan y configuración.',
      ARRAY['web_client', 'admin']::TEXT[],
      'client',
      12
    ),
    (
      'Varias numeraciones para recibir SMS',
      'panel_cliente',
      ARRAY['varios numeros', 'multiples numeraciones', 'numeraciones', 'numero dedicado', 'sms entrante', 'empresa']::TEXT[],
      'Una empresa puede tener varias numeraciones activas (por ejemplo distintas SIM, líneas o números dedicados). Cada una puede recibir SMS entrantes de forma independiente.

En /app/numeraciones ves el listado; en /app/sms-inbox puedes filtrar o cambiar de numeración para revisar los mensajes de cada línea.

Contratar numeraciones adicionales depende de tu plan y disponibilidad comercial. El asistente puede orientarte; la gestión contractual se hace desde planes, soporte o tu ejecutivo Telvoice.',
      ARRAY['web_client', 'admin']::TEXT[],
      'client',
      13
    ),
    (
      'Mensajes simulados y mensajes reales en SMS entrantes',
      'panel_cliente',
      ARRAY['simulacion', 'simular', 'mensajes reales', 'prueba', 'sms entrante', 'qa', 'test']::TEXT[],
      'En el panel puedes generar SMS entrantes simulados para probar la bandeja y flujos internos. Un mensaje simulado no proviene de un teléfono externo real: sirve para validar que la numeración, permisos y visualización funcionan.

Un mensaje real es un SMS que un usuario o sistema envió a tu numeración activa en la red; aparece en /app/sms-inbox con origen y contenido auténticos.

No trates una simulación como confirmación de que un cliente respondió en producción. Para operación real, espera tráfico externo hacia tu número contratado.',
      ARRAY['web_client', 'admin']::TEXT[],
      'client',
      13
    )
) AS v(title, category, keywords, content, allowed_channels, audience, priority)
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_articles ka WHERE ka.title = v.title
);
