-- Productos comerciales Telvoice.cl y leads públicos

CREATE TABLE IF NOT EXISTS sms_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL DEFAULT 'CL',
  country_name TEXT NOT NULL DEFAULT 'Chile',
  product_name TEXT NOT NULL,
  description TEXT,
  sms_quantity INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CLP',
  price_amount INTEGER NOT NULL DEFAULT 0,
  unit_price NUMERIC(10, 2) NOT NULL,
  checkout_url TEXT,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  product_type TEXT NOT NULL DEFAULT 'sms_bundle',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_products_country_active
  ON sms_products (country_code, is_active);

CREATE INDEX IF NOT EXISTS idx_sms_products_quantity
  ON sms_products (sms_quantity);

DROP TRIGGER IF EXISTS trg_sms_products_updated_at ON sms_products;
CREATE TRIGGER trg_sms_products_updated_at
  BEFORE UPDATE ON sms_products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS public_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  email TEXT,
  phone TEXT,
  company TEXT,
  country TEXT NOT NULL DEFAULT 'CL',
  message TEXT,
  requested_quantity INTEGER,
  source TEXT NOT NULL DEFAULT 'telegram_agent',
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_leads_status ON public_leads (status);
CREATE INDEX IF NOT EXISTS idx_public_leads_created ON public_leads (created_at DESC);

-- Productos Telvoice.cl (Chile)
INSERT INTO sms_products (
  country_code, country_name, product_name, description,
  sms_quantity, currency, price_amount, unit_price,
  is_featured, is_active, product_type
)
SELECT v.country_code, v.country_name, v.product_name, v.description,
  v.sms_quantity, v.currency, v.price_amount, v.unit_price,
  v.is_featured, v.is_active, v.product_type
FROM (VALUES
  (
    'CL', 'Chile', 'Starter 1.000 SMS',
    'Ideal para pruebas, campañas pequeñas o envíos puntuales.',
    1000, 'CLP', 10000, 10::NUMERIC, false, true, 'sms_bundle'
  ),
  (
    'CL', 'Chile', 'Business 15.000 SMS',
    'Pensado para empresas con campañas mensuales y envíos frecuentes.',
    15000, 'CLP', 105000, 7::NUMERIC, true, true, 'sms_bundle'
  ),
  (
    'CL', 'Chile', 'Corporativo 100.000 SMS',
    'Para campañas masivas, alto volumen y operación recurrente.',
    100000, 'CLP', 500000, 5::NUMERIC, false, true, 'sms_bundle'
  ),
  (
    'CL', 'Chile', 'Alto volumen sobre 120.000 SMS',
    'Cotización automática a $5 + IVA por SMS para volúmenes superiores a 120.000 SMS.',
    120001, 'CLP', 0, 5::NUMERIC, false, true, 'custom_quote'
  )
) AS v(
  country_code, country_name, product_name, description,
  sms_quantity, currency, price_amount, unit_price,
  is_featured, is_active, product_type
)
WHERE NOT EXISTS (
  SELECT 1 FROM sms_products sp WHERE sp.product_name = v.product_name
);
