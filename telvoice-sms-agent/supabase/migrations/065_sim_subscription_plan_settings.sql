-- Configuración comercial editable — planes numeración SIM (panel + checkout autenticado).

CREATE TABLE IF NOT EXISTS sim_subscription_plan_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  monthly_price_clp INTEGER NOT NULL CHECK (monthly_price_clp >= 0),
  annual_discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 20
    CHECK (annual_discount_percent >= 0 AND annual_discount_percent <= 80),
  annual_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  included_sms INTEGER NOT NULL DEFAULT 0 CHECK (included_sms >= 0),
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  badge TEXT,
  ribbon TEXT,
  short_description TEXT,
  feature_list JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_sim_subscription_plan_settings_updated_at ON sim_subscription_plan_settings;
CREATE TRIGGER trg_sim_subscription_plan_settings_updated_at
  BEFORE UPDATE ON sim_subscription_plan_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE sim_subscription_plan_settings IS
  'Precios y catálogo comercial planes SIM (Starter/Pro/custom). Panel cliente y checkout autenticado leen esta tabla.';

INSERT INTO sim_subscription_plan_settings (
  plan_id,
  label,
  monthly_price_clp,
  annual_discount_percent,
  annual_enabled,
  included_sms,
  is_visible,
  is_featured,
  sort_order,
  ribbon,
  short_description,
  feature_list
) VALUES
  (
    'sim_starter',
    'Starter',
    29990,
    20,
    TRUE,
    1000,
    TRUE,
    FALSE,
    10,
    NULL,
    'Activa tu primer número SIM real con recepción SMS.',
    '[
      "1 número SIM real",
      "1.000 SMS salientes incluidos cada mes",
      "Recepción SMS",
      "Panel web Telvoice",
      "Agente Telvoice incluido",
      "Activación asistida"
    ]'::jsonb
  ),
  (
    'sim_pro',
    'Pro',
    49990,
    20,
    TRUE,
    2000,
    TRUE,
    TRUE,
    20,
    'Popular',
    'Mayor capacidad operativa, notificaciones por Telegram, webhooks e integraciones.',
    '[
      "Todo lo que incluye Starter",
      "2.000 SMS salientes incluidos cada mes",
      "Bot de Telegram para alertas y operación",
      "Automatizaciones iniciales",
      "Webhooks/API para integración"
    ]'::jsonb
  ),
  (
    'custom',
    'A medida',
    0,
    0,
    FALSE,
    0,
    TRUE,
    FALSE,
    30,
    NULL,
    'Para múltiples números, volumen o integraciones especiales.',
    '[
      "Múltiples números SIM reales",
      "Volumen SMS personalizado",
      "Automatizaciones e integraciones avanzadas",
      "Integración API/Webhooks",
      "Soporte operativo Telvoice",
      "Diseño de flujo a medida"
    ]'::jsonb
  )
ON CONFLICT (plan_id) DO NOTHING;
