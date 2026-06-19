-- Toggle explícito: numeración SIM con o sin bolsa mensual de SMS salientes.

ALTER TABLE sim_subscription_plan_settings
  ADD COLUMN IF NOT EXISTS includes_outbound_sms BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN sim_subscription_plan_settings.includes_outbound_sms IS
  'Si false, el plan es solo numeración/recepción SMS sin acreditar ni mostrar SMS salientes incluidos.';

-- Planes con included_sms = 0 deben reflejar el toggle apagado.
UPDATE sim_subscription_plan_settings
SET includes_outbound_sms = FALSE
WHERE included_sms = 0
  AND plan_id IN ('sim_starter', 'sim_pro', 'sim_power');
