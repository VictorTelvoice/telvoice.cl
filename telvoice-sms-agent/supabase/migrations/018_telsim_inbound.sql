-- SMS entrantes desde webhook telsim.io (evento sms.received)

CREATE TABLE IF NOT EXISTS telsim_inbound_sms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event TEXT NOT NULL DEFAULT 'sms.received',
  sender_from TEXT NOT NULL,
  content TEXT NOT NULL,
  verification_code TEXT,
  service TEXT,
  slot_id TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telsim_inbound_slot_received
  ON telsim_inbound_sms (slot_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_telsim_inbound_sender_received
  ON telsim_inbound_sms (sender_from, received_at DESC);
