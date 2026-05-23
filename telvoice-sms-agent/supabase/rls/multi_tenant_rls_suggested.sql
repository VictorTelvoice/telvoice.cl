-- =============================================================================
-- RLS SUGERIDO — NO EJECUTAR EN PRODUCCIÓN SIN REVISIÓN
-- El agente usa service_role (bypass RLS). Estas políticas aplican cuando
-- clientes accedan vía Supabase Auth desde el futuro panel /app.
-- =============================================================================

-- ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE company_users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Ejemplo companies: superadmin / internos leen todo; cliente solo su empresa
-- CREATE POLICY companies_select_internal ON companies
--   FOR SELECT
--   USING (
--     EXISTS (
--       SELECT 1 FROM user_profiles up
--       WHERE up.user_id = auth.uid()
--         AND up.role IN ('superadmin', 'telvoice_operator', 'telvoice_finance', 'admin')
--     )
--   );

-- CREATE POLICY companies_select_own ON companies
--   FOR SELECT
--   USING (
--     id IN (
--       SELECT company_id FROM user_profiles
--       WHERE user_id = auth.uid() AND company_id IS NOT NULL
--     )
--   );

-- user_profiles: leer propio perfil
-- CREATE POLICY user_profiles_select_self ON user_profiles
--   FOR SELECT USING (user_id = auth.uid());

-- audit_logs: solo internos Telvoice
-- CREATE POLICY audit_logs_select_internal ON audit_logs
--   FOR SELECT
--   USING (
--     EXISTS (
--       SELECT 1 FROM user_profiles up
--       WHERE up.user_id = auth.uid()
--         AND up.role IN ('superadmin', 'telvoice_operator', 'telvoice_finance', 'admin')
--     )
--   );

-- Futuro: wallets, campaigns, sms_messages, purchases, invoices, api_keys
--   → ADD company_id + RLS por company_id = perfil.company_id
