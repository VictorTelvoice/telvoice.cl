-- Tramos de precio unitario calculadora Telvoice.cl (Chile)

CREATE TABLE IF NOT EXISTS sms_pricing_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL DEFAULT 'CL',
  min_quantity INTEGER NOT NULL,
  unit_price NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CLP',
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_pricing_tiers_country
  ON sms_pricing_tiers (country_code, is_active, min_quantity);

DROP TRIGGER IF EXISTS trg_sms_pricing_tiers_updated_at ON sms_pricing_tiers;
CREATE TRIGGER trg_sms_pricing_tiers_updated_at
  BEFORE UPDATE ON sms_pricing_tiers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO sms_pricing_tiers (country_code, min_quantity, unit_price, currency, label, sort_order)
SELECT v.country_code, v.min_quantity, v.unit_price, v.currency, v.label, v.sort_order
FROM (VALUES
  ('CL', 1000, 10::NUMERIC, 'CLP', 'Desde 1.000 SMS', 10),
  ('CL', 5000, 9::NUMERIC, 'CLP', 'Desde 5.000 SMS', 20),
  ('CL', 10000, 8::NUMERIC, 'CLP', 'Desde 10.000 SMS', 30),
  ('CL', 15000, 7::NUMERIC, 'CLP', 'Desde 15.000 SMS', 40),
  ('CL', 50000, 6::NUMERIC, 'CLP', 'Desde 50.000 SMS', 50),
  ('CL', 100000, 5::NUMERIC, 'CLP', 'Desde 100.000 SMS', 60)
) AS v(country_code, min_quantity, unit_price, currency, label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM sms_pricing_tiers t
  WHERE t.country_code = v.country_code AND t.min_quantity = v.min_quantity
);

INSERT INTO knowledge_articles (title, category, keywords, content)
SELECT
  'Cómo funciona la calculadora Telvoice.cl',
  'comercial',
  ARRAY['calculadora', 'precios', 'tramos', 'bolsas', 'sms', 'chile']::TEXT[],
  'Telvoice.cl calcula sus bolsas en múltiplos de 1.000 SMS. El precio unitario depende del volumen: desde 1.000 SMS $10 + IVA, desde 5.000 SMS $9 + IVA, desde 10.000 SMS $8 + IVA, desde 15.000 SMS $7 + IVA, desde 50.000 SMS $6 + IVA y desde 100.000 SMS $5 + IVA. Para cantidades intermedias se aplica el tramo correspondiente. Por ejemplo, 30.000 SMS se cotizan a $7 + IVA por SMS y 70.000 SMS a $6 + IVA por SMS.'
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_articles ka
  WHERE ka.title = 'Cómo funciona la calculadora Telvoice.cl'
);
