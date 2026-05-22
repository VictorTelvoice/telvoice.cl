-- Usuarios Telegram autorizados por cliente

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
