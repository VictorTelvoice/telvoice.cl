-- Metadatos por empresa (tarjeta de cobro, preferencias panel cliente, bootstrap OAuth, etc.)
-- Idempotente: seguro re-ejecutar en producción.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.companies.metadata IS 'Configuración extendida del tenant (p. ej. payment_card en panel cliente)';

-- PostgREST: recargar schema cache (también lo ejecuta apply-migration-021.mjs)
SELECT pg_notify('pgrst', 'reload schema');
