-- Telvoice SMS Agent — esquema inicial
-- Ejecutar en Supabase SQL Editor o con: supabase db push

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Cuentas SMS por proveedor
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Saldos por cliente y país
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Libro mayor de saldo
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Mensajes SMS
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Eventos DLR
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Triggers updated_at
-- ---------------------------------------------------------------------------
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
