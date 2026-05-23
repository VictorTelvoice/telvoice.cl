-- Etapa 10: modo live_test en campañas y mensajes panel (sin RLS)

ALTER TABLE sms_campaigns
  DROP CONSTRAINT IF EXISTS sms_campaigns_mode_check;

ALTER TABLE sms_campaigns
  ADD CONSTRAINT sms_campaigns_mode_check
  CHECK (mode IN ('mock', 'live', 'live_test'));

ALTER TABLE panel_sms_messages
  DROP CONSTRAINT IF EXISTS panel_sms_messages_mode_check;

ALTER TABLE panel_sms_messages
  ADD CONSTRAINT panel_sms_messages_mode_check
  CHECK (mode IN ('mock', 'live', 'live_test'));
