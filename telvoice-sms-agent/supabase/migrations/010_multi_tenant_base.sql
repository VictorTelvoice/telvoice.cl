-- =============================================================================
-- Multi-tenant base: empresas, perfiles, membresías y auditoría
-- Migración ADITIVA — no elimina ni reemplaza tablas existentes.
-- Ejecutar manualmente en Supabase SQL Editor cuando estés listo.
-- =============================================================================

-- Empresas cliente (tenant comercial)
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  legal_name TEXT,
  rut TEXT,
  billing_email TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  country TEXT NOT NULL DEFAULT 'CL',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT companies_status_check CHECK (
    status IN ('active', 'pending', 'suspended', 'blocked')
  )
);

CREATE INDEX IF NOT EXISTS idx_companies_status ON companies (status);
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies (name);

DROP TRIGGER IF EXISTS trg_companies_updated_at ON companies;
CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Perfil extendido (internos Telvoice y futuros usuarios cliente)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  admin_user_id UUID REFERENCES admin_users (id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies (id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_profiles_status_check CHECK (
    status IN ('active', 'inactive', 'suspended')
  ),
  CONSTRAINT user_profiles_role_check CHECK (
    role IN (
      'superadmin',
      'telvoice_operator',
      'telvoice_finance',
      'client_owner',
      'client_admin',
      'client_operator',
      'client_viewer',
      'admin'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_email_lower
  ON user_profiles (lower(email));

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_admin_user_id
  ON user_profiles (admin_user_id)
  WHERE admin_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_user_id
  ON user_profiles (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_profiles_company_id
  ON user_profiles (company_id);

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Membresía multi-empresa (futuro)
CREATE TABLE IF NOT EXISTS company_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users (id) ON DELETE CASCADE,
  profile_id UUID REFERENCES user_profiles (id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT company_users_status_check CHECK (
    status IN ('active', 'inactive', 'suspended')
  )
);

CREATE INDEX IF NOT EXISTS idx_company_users_company_id
  ON company_users (company_id);

CREATE INDEX IF NOT EXISTS idx_company_users_profile_id
  ON company_users (profile_id)
  WHERE profile_id IS NOT NULL;

-- Auditoría de acciones críticas
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  actor_role TEXT,
  company_id UUID REFERENCES companies (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id
  ON audit_logs (company_id)
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON audit_logs (action);

-- Enlace opcional clients (operación SMS) → companies (comercial)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_company_id
  ON clients (company_id)
  WHERE company_id IS NOT NULL;

COMMENT ON TABLE companies IS 'Empresa cliente Telvoice (tenant comercial)';
COMMENT ON TABLE user_profiles IS 'Perfil y rol; admin_user_id enlaza panel /admin actual';
COMMENT ON TABLE company_users IS 'Usuario en una o más empresas';
COMMENT ON TABLE audit_logs IS 'Registro de acciones críticas Superadmin';
COMMENT ON COLUMN clients.company_id IS 'FK opcional a companies; NULL para clientes legacy/prueba';
