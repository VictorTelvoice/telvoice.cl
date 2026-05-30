-- SMPP Vendor Account fields (aSMSC-style) on wholesale_smpp_connections

ALTER TABLE wholesale_smpp_connections
  ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'smpp',
  ADD COLUMN IF NOT EXISTS account_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS transmitter_port INTEGER,
  ADD COLUMN IF NOT EXISTS receiver_port INTEGER,
  ADD COLUMN IF NOT EXISTS addr_ton INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS addr_npi INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dest_addr_ton INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS dest_addr_npi INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS response_timeout_seconds INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS enquire_link_interval_seconds INTEGER NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS submit_speed_per_second INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS delay_time_seconds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sessions INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sender_id_prefix TEXT,
  ADD COLUMN IF NOT EXISTS phone_number_prepend TEXT,
  ADD COLUMN IF NOT EXISTS message_types_allowed TEXT NOT NULL DEFAULT 'text, unicode, flash sms, unicode flash sms',
  ADD COLUMN IF NOT EXISTS route_type TEXT NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS identifier TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS log_level TEXT NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS tlv_tag TEXT,
  ADD COLUMN IF NOT EXISTS tlv_value TEXT,
  ADD COLUMN IF NOT EXISTS esme_acknowledgement BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS send_validity_period_as_null BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_affix_for_sms_id BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_decimal_only_for_sms_id BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_import_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS secure_connection_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_optional_parameters_enabled BOOLEAN NOT NULL DEFAULT false;

-- Backfill ports from legacy single port column
UPDATE wholesale_smpp_connections
SET transmitter_port = port
WHERE transmitter_port IS NULL;

UPDATE wholesale_smpp_connections
SET receiver_port = COALESCE(transmitter_port, port)
WHERE receiver_port IS NULL;

-- Migrate enquire link interval from milliseconds (legacy) to seconds
UPDATE wholesale_smpp_connections
SET enquire_link_interval_seconds = GREATEST(
  1,
  LEAST(3600, enquire_link_interval / 1000)
)
WHERE enquire_link_interval IS NOT NULL
  AND enquire_link_interval > 1000;

COMMENT ON COLUMN wholesale_smpp_connections.label IS 'Account name (aSMSC Account Name)';
COMMENT ON COLUMN wholesale_smpp_connections.bind_type IS 'Bind type / connection mode: transmitter, receiver, transceiver';
COMMENT ON COLUMN wholesale_smpp_connections.port IS 'Legacy single port; kept in sync with transmitter_port for compatibility';
