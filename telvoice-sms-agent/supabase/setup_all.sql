-- =============================================================================
-- Telvoice SMS Agent — INSTALACIÓN COMPLETA EN SUPABASE
-- =============================================================================
-- Copia TODO este archivo, pégalo en Supabase → SQL Editor → Run
-- Solo necesitas ejecutar este archivo una vez por proyecto.
-- =============================================================================

-- ========== PARTE 1: Esquema principal (001_initial_schema) ==========

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  telegram_chat_id TEXT UNIQUE,
  whatsapp_number TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clients_company_name_unique UNIQUE (company_name)
);

CREATE TABLE IF NOT EXISTS client_sms_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'asmsc',
  api_id TEXT NOT NULL,
  api_password_encrypted TEXT NOT NULL,
  default_sender_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_sms_accounts_client_provider_unique UNIQUE (client_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_client_sms_accounts_client_id
  ON client_sms_accounts (client_id);

CREATE TABLE IF NOT EXISTS balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  available_units INTEGER NOT NULL DEFAULT 0,
  reserved_units INTEGER NOT NULL DEFAULT 0,
  consumed_units INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT balances_client_country_unique UNIQUE (client_id, country_code)
);

CREATE TABLE IF NOT EXISTS balance_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  units INTEGER NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_balance_ledger_client_id
  ON balance_ledger (client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients (id) ON DELETE RESTRICT,
  provider TEXT NOT NULL DEFAULT 'asmsc',
  uid TEXT NOT NULL,
  provider_message_id TEXT,
  sms_id TEXT,
  phonenumber TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  textmessage TEXT NOT NULL,
  sms_type TEXT NOT NULL DEFAULT 'T',
  encoding TEXT NOT NULL DEFAULT 'T',
  estimated_parts INTEGER NOT NULL DEFAULT 1 CHECK (estimated_parts >= 1),
  client_cost INTEGER,
  provider_status TEXT,
  status TEXT NOT NULL DEFAULT 'pending_submit'
    CHECK (status IN (
      'pending_submit',
      'submitted',
      'failed',
      'delivered',
      'pending',
      'unknown'
    )),
  dlr_status TEXT,
  error_code TEXT,
  error_description TEXT,
  remarks TEXT,
  raw_submit_response JSONB,
  raw_dlr_payload JSONB,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sms_messages_uid_unique UNIQUE (uid)
);

CREATE INDEX IF NOT EXISTS idx_sms_messages_client_id ON sms_messages (client_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_uid ON sms_messages (uid);
CREATE INDEX IF NOT EXISTS idx_sms_messages_provider_message_id ON sms_messages (provider_message_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_status ON sms_messages (status);

CREATE TABLE IF NOT EXISTS sms_dlr_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sms_message_id UUID REFERENCES sms_messages (id) ON DELETE SET NULL,
  uid TEXT,
  provider_message_id TEXT,
  phone_number TEXT,
  dlr_status TEXT,
  sms_id TEXT,
  client_cost INTEGER,
  error_code TEXT,
  error_description TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_dlr_events_uid ON sms_dlr_events (uid);
CREATE INDEX IF NOT EXISTS idx_sms_dlr_events_provider_message_id
  ON sms_dlr_events (provider_message_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clients_updated_at ON clients;
CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_balances_updated_at ON balances;
CREATE TRIGGER trg_balances_updated_at
  BEFORE UPDATE ON balances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_sms_messages_updated_at ON sms_messages;
CREATE TRIGGER trg_sms_messages_updated_at
  BEFORE UPDATE ON sms_messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ========== PARTE 2: Usuarios admin (002_admin_users) ==========

CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'superadmin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users (email);

DROP TRIGGER IF EXISTS trg_admin_users_updated_at ON admin_users;
CREATE TRIGGER trg_admin_users_updated_at
  BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ========== PARTE 3: Usuarios Telegram por cliente (003_client_telegram_users) ==========

CREATE TABLE IF NOT EXISTS client_telegram_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  telegram_user_id TEXT NOT NULL,
  telegram_chat_id TEXT,
  telegram_username TEXT,
  first_name TEXT,
  last_name TEXT,
  role TEXT NOT NULL DEFAULT 'operator',
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_telegram_users_client_telegram_user_unique
    UNIQUE (client_id, telegram_user_id),
  CONSTRAINT client_telegram_users_role_check
    CHECK (role IN ('owner', 'operator', 'viewer'))
);

CREATE INDEX IF NOT EXISTS idx_client_telegram_users_client_id
  ON client_telegram_users (client_id);

CREATE INDEX IF NOT EXISTS idx_client_telegram_users_telegram_user_id
  ON client_telegram_users (telegram_user_id);

CREATE INDEX IF NOT EXISTS idx_client_telegram_users_is_active
  ON client_telegram_users (is_active);

DROP TRIGGER IF EXISTS trg_client_telegram_users_updated_at ON client_telegram_users;
CREATE TRIGGER trg_client_telegram_users_updated_at
  BEFORE UPDATE ON client_telegram_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ========== PARTE 4: Base de conocimiento (004_knowledge_articles) ==========

CREATE TABLE IF NOT EXISTS knowledge_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_category
  ON knowledge_articles (category);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_is_active
  ON knowledge_articles (is_active);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_title
  ON knowledge_articles (title);

DROP TRIGGER IF EXISTS trg_knowledge_articles_updated_at ON knowledge_articles;
CREATE TRIGGER trg_knowledge_articles_updated_at
  BEFORE UPDATE ON knowledge_articles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO knowledge_articles (title, category, keywords, content)
SELECT * FROM (VALUES
  ('Qué significa submitted', 'dlr', ARRAY['submitted', 'estado', 'enviado', 'proveedor', 'asmsc']::TEXT[], 'Submitted significa que aSMSC aceptó el SMS y lo envió al flujo del proveedor. No significa necesariamente delivered.'),
  ('Qué significa delivered', 'dlr', ARRAY['delivered', 'entregado', 'dlr', 'confirmación']::TEXT[], 'Delivered significa que llegó un DLR confirmado por el operador/proveedor.'),
  ('Por qué no llega DLR en localhost', 'dlr', ARRAY['dlr', 'localhost', 'webhook', 'local', 'desarrollo']::TEXT[], 'aSMSC no puede llamar a localhost. Para recibir DLR real se necesita una URL pública como agent.telvoice.cl o un túnel público.'),
  ('Qué significa IP Not Whitelisted', 'errores', ARRAY['ip', 'whitelist', 'whitelisted', 'asmsc', 'error']::TEXT[], 'La IP pública del servidor no está autorizada en aSMSC. Se debe agregar en API → Add Whitelist IP.'),
  ('Diferencia entre SMS tipo P y T', 'sms', ARRAY['sms', 'tipo', 'promocional', 'transaccional', 'p', 't']::TEXT[], 'P es promocional. T es transaccional. Algunas cuentas deben tener T habilitado por proveedor.'),
  ('Cómo consultar saldo', 'saldo', ARRAY['saldo', 'balance', 'crédito', 'unidades', 'asmsc']::TEXT[], 'El saldo interno vive en Telvoice SMS Agent. El balance técnico viene desde aSMSC.'),
  ('Cómo enviar SMS por Telegram', 'telegram', ARRAY['telegram', 'enviar', 'bot', 'sms', 'confirmar']::TEXT[], 'Usar enviar 569XXXXXXXX mensaje. El sistema pedirá confirmación antes de enviar.'),
  ('Seguridad de envíos', 'soporte', ARRAY['seguridad', 'autorización', 'confirmación', 'usuarios']::TEXT[], 'El bot solo permite usuarios autorizados en client_telegram_users y exige confirmación antes de consumir saldo.')
) AS v(title, category, keywords, content)
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles LIMIT 1);

-- ========== PARTE 5: FAQ adicional (005_knowledge_faq_articles) ==========

INSERT INTO knowledge_articles (title, category, keywords, content)
SELECT v.title, v.category, v.keywords, v.content
FROM (VALUES
  ('Qué significa failed', 'dlr', ARRAY['failed', 'fallido', 'error', 'no llegó', 'rechazado', 'fallo', 'sms no enviado']::TEXT[], 'Failed significa que el SMS falló o fue rechazado en alguna etapa del flujo. Puede ocurrir por número inválido, ruta no disponible, proveedor rechazado, cuenta sin permiso, IP no autorizada, saldo insuficiente o error del operador. Failed no siempre significa que el SMS salió al operador; se debe revisar provider_status, remarks, ErrorCode y DLRStatus.'),
  ('Diferencia entre submitted, delivered y failed', 'dlr', ARRAY['submitted', 'delivered', 'failed', 'estados', 'dlr', 'diferencia']::TEXT[], 'Submitted significa que aSMSC aceptó el SMS. Delivered significa que existe confirmación de entrega mediante DLR. Failed significa que el SMS fue rechazado o falló. Para operación SMS, submitted no equivale a delivered.'),
  ('Por qué mi SMS no llega', 'soporte', ARRAY['no llega', 'sms no llega', 'entrega', 'problema', 'operador', 'ruta']::TEXT[], 'Un SMS puede no llegar por número inválido, bloqueo del operador, ruta sin cobertura, sender no permitido, saldo insuficiente, tipo de SMS no habilitado, error del proveedor o falta de DLR. Se recomienda revisar el detalle del SMS en el dashboard, provider_status, remarks y DLRStatus.'),
  ('Qué significa provider_status S', 'api', ARRAY['provider_status', 's', 'submitted', 'proveedor', 'aceptado']::TEXT[], 'provider_status S significa que aSMSC aceptó el mensaje y entregó un provider_message_id. El SMS queda en estado submitted hasta recibir DLR.'),
  ('Qué significa provider_status F', 'api', ARRAY['provider_status', 'f', 'failed', 'rechazado', 'proveedor']::TEXT[], 'provider_status F significa que aSMSC rechazó el SMS. El motivo se debe revisar en remarks o provider_response. En ese caso el SMS no fue aceptado correctamente por el proveedor.'),
  ('Qué es DLR', 'dlr', ARRAY['dlr', 'delivery report', 'reporte entrega', 'estado entrega']::TEXT[], 'DLR significa Delivery Report. Es el reporte que informa el estado final o intermedio de un SMS, como Delivered, Failed, Expired o Rejected. Para recibir DLR real, el webhook debe estar en una URL pública.'),
  ('Qué es Sender ID', 'sms', ARRAY['sender', 'sender id', 'remitente', 'telvoice']::TEXT[], 'Sender ID es el nombre o identificador que aparece como remitente del SMS. Algunos países u operadores exigen sender preaprobado. En pruebas Telvoice se usa TELVOICE como sender por defecto.'),
  ('Qué es sms_type P', 'sms', ARRAY['p', 'promotional', 'promocional', 'sms_type']::TEXT[], 'sms_type P corresponde a tráfico promocional. Se usa para campañas, avisos comerciales o mensajes masivos no críticos. Algunas cuentas permiten P por defecto.'),
  ('Qué es sms_type T', 'sms', ARRAY['t', 'transactional', 'transaccional', 'otp', 'sms_type']::TEXT[], 'sms_type T corresponde a tráfico transaccional, como OTP, códigos, alertas o notificaciones críticas. Algunas cuentas requieren habilitación especial para enviar tráfico T.'),
  ('Qué significa saldo interno', 'saldo', ARRAY['saldo interno', 'balance interno', 'unidades', 'crédito']::TEXT[], 'El saldo interno es el saldo controlado por Telvoice SMS Agent para cada cliente. Sirve para gestionar consumo, reservas y operaciones dentro del dashboard o bot.'),
  ('Qué significa balance técnico aSMSC', 'saldo', ARRAY['balance tecnico', 'asmsc', 'saldo proveedor', 'balance amount']::TEXT[], 'El balance técnico aSMSC es el saldo que reporta directamente la plataforma proveedora aSMSC. Puede diferir del saldo interno del cliente.'),
  ('Cómo funciona el bot Telegram', 'telegram', ARRAY['telegram', 'bot', 'comandos', 'enviar', 'saldo']::TEXT[], 'El bot Telegram permite consultar saldo, revisar historial, hacer preguntas sobre el servicio y preparar envíos SMS. Para enviar, el usuario debe estar autorizado y confirmar el envío antes de ejecutarlo.'),
  ('Qué comandos tiene el bot Telegram', 'telegram', ARRAY['comandos', 'ayuda', 'saldo', 'historial', 'enviar', 'buscar']::TEXT[], 'Comandos disponibles: saldo, historial, enviar 569XXXXXXXX mensaje, buscar tema, ayuda. También se pueden hacer preguntas como qué significa submitted o por qué no llega el DLR.'),
  ('Cómo autorizo un usuario Telegram', 'telegram', ARRAY['autorizar usuario', 'telegram user id', 'cliente', 'operador']::TEXT[], 'Un usuario Telegram se autoriza desde el dashboard del cliente, en Usuarios Telegram autorizados. Se debe registrar el Telegram User ID y dejarlo activo.'),
  ('Qué pasa si no estoy autorizado', 'seguridad', ARRAY['no autorizado', 'permiso', 'usuario', 'telegram']::TEXT[], 'Si el usuario Telegram no está registrado y activo en client_telegram_users, el bot no permitirá operar ni consultar información privada del cliente.'),
  ('Por qué el DLR queda pendiente', 'dlr', ARRAY['pendiente', 'dlr pendiente', 'submitted', 'callback', 'webhook']::TEXT[], 'El DLR puede quedar pendiente si el proveedor aún no envía reporte, si el operador no respondió, si el webhook no es público o si el callback_url está configurado en localhost.')
) AS v(title, category, keywords, content)
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_articles ka WHERE ka.title = v.title
);

-- ========== PARTE 6: Comercial Telvoice.cl — ejecutar también 006 y 007 si actualizas una BD existente ==========

-- =============================================================================
-- Fin. Si no hubo errores, la base de datos está lista.
-- =============================================================================
