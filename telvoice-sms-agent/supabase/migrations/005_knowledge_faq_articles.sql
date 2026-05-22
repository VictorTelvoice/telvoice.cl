-- Artículos FAQ adicionales (base Telvoice)

INSERT INTO knowledge_articles (title, category, keywords, content)
SELECT v.title, v.category, v.keywords, v.content
FROM (VALUES
  (
    'Qué significa failed',
    'dlr',
    ARRAY['failed', 'fallido', 'error', 'no llegó', 'rechazado', 'fallo', 'sms no enviado']::TEXT[],
    'Failed significa que el SMS falló o fue rechazado en alguna etapa del flujo. Puede ocurrir por número inválido, ruta no disponible, proveedor rechazado, cuenta sin permiso, IP no autorizada, saldo insuficiente o error del operador. Failed no siempre significa que el SMS salió al operador; se debe revisar provider_status, remarks, ErrorCode y DLRStatus.'
  ),
  (
    'Diferencia entre submitted, delivered y failed',
    'dlr',
    ARRAY['submitted', 'delivered', 'failed', 'estados', 'dlr', 'diferencia']::TEXT[],
    'Submitted significa que aSMSC aceptó el SMS. Delivered significa que existe confirmación de entrega mediante DLR. Failed significa que el SMS fue rechazado o falló. Para operación SMS, submitted no equivale a delivered.'
  ),
  (
    'Por qué mi SMS no llega',
    'soporte',
    ARRAY['no llega', 'sms no llega', 'entrega', 'problema', 'operador', 'ruta']::TEXT[],
    'Un SMS puede no llegar por número inválido, bloqueo del operador, ruta sin cobertura, sender no permitido, saldo insuficiente, tipo de SMS no habilitado, error del proveedor o falta de DLR. Se recomienda revisar el detalle del SMS en el dashboard, provider_status, remarks y DLRStatus.'
  ),
  (
    'Qué significa provider_status S',
    'api',
    ARRAY['provider_status', 's', 'submitted', 'proveedor', 'aceptado']::TEXT[],
    'provider_status S significa que aSMSC aceptó el mensaje y entregó un provider_message_id. El SMS queda en estado submitted hasta recibir DLR.'
  ),
  (
    'Qué significa provider_status F',
    'api',
    ARRAY['provider_status', 'f', 'failed', 'rechazado', 'proveedor']::TEXT[],
    'provider_status F significa que aSMSC rechazó el SMS. El motivo se debe revisar en remarks o provider_response. En ese caso el SMS no fue aceptado correctamente por el proveedor.'
  ),
  (
    'Qué es DLR',
    'dlr',
    ARRAY['dlr', 'delivery report', 'reporte entrega', 'estado entrega']::TEXT[],
    'DLR significa Delivery Report. Es el reporte que informa el estado final o intermedio de un SMS, como Delivered, Failed, Expired o Rejected. Para recibir DLR real, el webhook debe estar en una URL pública.'
  ),
  (
    'Qué es Sender ID',
    'sms',
    ARRAY['sender', 'sender id', 'remitente', 'telvoice']::TEXT[],
    'Sender ID es el nombre o identificador que aparece como remitente del SMS. Algunos países u operadores exigen sender preaprobado. En pruebas Telvoice se usa TELVOICE como sender por defecto.'
  ),
  (
    'Qué es sms_type P',
    'sms',
    ARRAY['p', 'promotional', 'promocional', 'sms_type']::TEXT[],
    'sms_type P corresponde a tráfico promocional. Se usa para campañas, avisos comerciales o mensajes masivos no críticos. Algunas cuentas permiten P por defecto.'
  ),
  (
    'Qué es sms_type T',
    'sms',
    ARRAY['t', 'transactional', 'transaccional', 'otp', 'sms_type']::TEXT[],
    'sms_type T corresponde a tráfico transaccional, como OTP, códigos, alertas o notificaciones críticas. Algunas cuentas requieren habilitación especial para enviar tráfico T.'
  ),
  (
    'Qué significa saldo interno',
    'saldo',
    ARRAY['saldo interno', 'balance interno', 'unidades', 'crédito']::TEXT[],
    'El saldo interno es el saldo controlado por Telvoice SMS Agent para cada cliente. Sirve para gestionar consumo, reservas y operaciones dentro del dashboard o bot.'
  ),
  (
    'Qué significa balance técnico aSMSC',
    'saldo',
    ARRAY['balance tecnico', 'asmsc', 'saldo proveedor', 'balance amount']::TEXT[],
    'El balance técnico aSMSC es el saldo que reporta directamente la plataforma proveedora aSMSC. Puede diferir del saldo interno del cliente.'
  ),
  (
    'Cómo funciona el bot Telegram',
    'telegram',
    ARRAY['telegram', 'bot', 'comandos', 'enviar', 'saldo']::TEXT[],
    'El bot Telegram permite consultar saldo, revisar historial, hacer preguntas sobre el servicio y preparar envíos SMS. Para enviar, el usuario debe estar autorizado y confirmar el envío antes de ejecutarlo.'
  ),
  (
    'Qué comandos tiene el bot Telegram',
    'telegram',
    ARRAY['comandos', 'ayuda', 'saldo', 'historial', 'enviar', 'buscar']::TEXT[],
    'Comandos disponibles: saldo, historial, enviar 569XXXXXXXX mensaje, buscar tema, ayuda. También se pueden hacer preguntas como qué significa submitted o por qué no llega el DLR.'
  ),
  (
    'Cómo autorizo un usuario Telegram',
    'telegram',
    ARRAY['autorizar usuario', 'telegram user id', 'cliente', 'operador']::TEXT[],
    'Un usuario Telegram se autoriza desde el dashboard del cliente, en Usuarios Telegram autorizados. Se debe registrar el Telegram User ID y dejarlo activo.'
  ),
  (
    'Qué pasa si no estoy autorizado',
    'seguridad',
    ARRAY['no autorizado', 'permiso', 'usuario', 'telegram']::TEXT[],
    'Si el usuario Telegram no está registrado y activo en client_telegram_users, el bot no permitirá operar ni consultar información privada del cliente.'
  ),
  (
    'Por qué el DLR queda pendiente',
    'dlr',
    ARRAY['pendiente', 'dlr pendiente', 'submitted', 'callback', 'webhook']::TEXT[],
    'El DLR puede quedar pendiente si el proveedor aún no envía reporte, si el operador no respondió, si el webhook no es público o si el callback_url está configurado en localhost.'
  )
) AS v(title, category, keywords, content)
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_articles ka WHERE ka.title = v.title
);
