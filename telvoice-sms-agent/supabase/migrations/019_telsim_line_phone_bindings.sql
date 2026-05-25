-- Enlace SMS entrantes ↔ líneas QA (sin depender solo de slot_id en .env)

ALTER TABLE telsim_inbound_sms
  ADD COLUMN IF NOT EXISTS line_phone TEXT;

CREATE INDEX IF NOT EXISTS idx_telsim_inbound_line_received
  ON telsim_inbound_sms (line_phone, received_at DESC);

CREATE TABLE IF NOT EXISTS telsim_slot_bindings (
  slot_id TEXT PRIMARY KEY,
  verify_phone TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telsim_slot_bindings_phone
  ON telsim_slot_bindings (verify_phone);
