-- Catálogo comercial Chile — precios provisionales + metadata (Etapa 6 cierre)
-- Ejecutar manualmente en Supabase SQL Editor o: node scripts/apply-commercial-catalog.mjs
-- No borra datos QA; solo actualiza bolsas por nombre.

UPDATE sms_packages SET
  sms_quantity = 1000,
  unit_price = 15.00,
  total_price = 15000.00,
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'customer_visible', true,
    'channel', 'web',
    'segment', 'standard'
  ),
  updated_at = now()
WHERE name = 'Bolsa Chile 1.000 SMS';

UPDATE sms_packages SET
  sms_quantity = 5000,
  unit_price = 14.00,
  total_price = 70000.00,
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'customer_visible', true,
    'channel', 'web',
    'segment', 'standard'
  ),
  updated_at = now()
WHERE name = 'Bolsa Chile 5.000 SMS';

UPDATE sms_packages SET
  sms_quantity = 10000,
  unit_price = 13.00,
  total_price = 130000.00,
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'customer_visible', true,
    'channel', 'web',
    'segment', 'standard'
  ),
  updated_at = now()
WHERE name = 'Bolsa Chile 10.000 SMS';

UPDATE sms_packages SET
  sms_quantity = 50000,
  unit_price = 12.00,
  total_price = 600000.00,
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'customer_visible', true,
    'channel', 'web',
    'segment', 'standard'
  ),
  updated_at = now()
WHERE name = 'Bolsa Chile 50.000 SMS';

UPDATE sms_packages SET
  sms_quantity = 100000,
  unit_price = 11.00,
  total_price = 1100000.00,
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'customer_visible', true,
    'channel', 'web',
    'segment', 'standard'
  ),
  updated_at = now()
WHERE name = 'Bolsa Chile 100.000 SMS';

-- Bolsas QA / prueba: no visibles en /app futuro (no se eliminan)
UPDATE sms_packages SET
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'customer_visible', false,
    'channel', 'internal',
    'segment', 'standard'
  ),
  updated_at = now()
WHERE name ILIKE '%QA%' OR name ILIKE '%E2E%' OR name ILIKE '%prueba%';
