-- Columnas de enrutamiento comercial en mensajes panel (reportes)

ALTER TABLE panel_sms_messages
  ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES sms_providers (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS route_id UUID REFERENCES sms_routes (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rate_plan_id UUID REFERENCES sms_rate_plans (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sell_price_per_sms NUMERIC(12, 4),
  ADD COLUMN IF NOT EXISTS cost_price_per_sms NUMERIC(12, 4),
  ADD COLUMN IF NOT EXISTS currency TEXT,
  ADD COLUMN IF NOT EXISTS margin NUMERIC(12, 4);

CREATE INDEX IF NOT EXISTS idx_panel_sms_messages_provider_id
  ON panel_sms_messages (provider_id);

CREATE INDEX IF NOT EXISTS idx_panel_sms_messages_route_id
  ON panel_sms_messages (route_id);
