-- Índices únicos para upsert de user_profiles (bootstrap OAuth / Magic Link).
-- PostgREST onConflict requiere índice UNIQUE sin predicado parcial.
-- Idempotente. Revisar duplicados antes de aplicar (ver scripts/apply-migration-026.mjs).

-- Reemplaza índices parciales de 010 por únicos completos (mismo efecto en filas no nulas).
DROP INDEX IF EXISTS public.idx_user_profiles_admin_user_id;
DROP INDEX IF EXISTS public.idx_user_profiles_user_id;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_admin_user_id_unique
  ON public.user_profiles (admin_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_user_id_unique
  ON public.user_profiles (user_id);

COMMENT ON INDEX public.user_profiles_admin_user_id_unique IS
  'Upsert bootstrap-client: onConflict admin_user_id';

COMMENT ON INDEX public.user_profiles_user_id_unique IS
  'Unicidad Supabase auth.users por perfil';

SELECT pg_notify('pgrst', 'reload schema');
