-- Seed OPCIONAL — ejecutar manualmente después de 011_wallets_packages_orders.sql
-- Requiere tabla companies existente. No se ejecuta automáticamente.

INSERT INTO sms_packages (
  name, country, sms_quantity, unit_price, total_price, currency, sort_order, is_active
)
SELECT * FROM (VALUES
  ('Bolsa Chile 1.000 SMS', 'CL', 1000, 12.00::numeric, 12000.00::numeric, 'CLP', 10, true),
  ('Bolsa Chile 5.000 SMS', 'CL', 5000, 11.00::numeric, 55000.00::numeric, 'CLP', 20, true),
  ('Bolsa Chile 10.000 SMS', 'CL', 10000, 10.00::numeric, 100000.00::numeric, 'CLP', 30, true),
  ('Bolsa Chile 50.000 SMS', 'CL', 50000, 9.00::numeric, 450000.00::numeric, 'CLP', 40, true),
  ('Bolsa Chile 100.000 SMS', 'CL', 100000, 8.20::numeric, 820000.00::numeric, 'CLP', 50, true)
) AS v(name, country, sms_quantity, unit_price, total_price, currency, sort_order, is_active)
WHERE NOT EXISTS (SELECT 1 FROM sms_packages LIMIT 1);
