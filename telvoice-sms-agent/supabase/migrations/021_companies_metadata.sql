-- Metadatos por empresa (tarjeta de cobro, preferencias panel cliente, etc.)
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN companies.metadata IS 'Configuración extendida del tenant (p. ej. payment_card en panel cliente)';
