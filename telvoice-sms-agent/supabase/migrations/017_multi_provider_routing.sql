-- Etapa 12: Routing multi-proveedor — políticas por cliente y pesos por ruta

ALTER TABLE company_rate_plans
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN company_rate_plans.metadata IS
  'Política routing cliente: allowed_provider_ids, blocked_provider_ids (UUID[])';

COMMENT ON COLUMN sms_rate_plans.metadata IS
  'routing_mode: single | weighted | round_robin';

COMMENT ON COLUMN sms_rate_plan_details.metadata IS
  'weight: peso relativo para distribución (default 100)';
