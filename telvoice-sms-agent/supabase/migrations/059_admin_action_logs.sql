-- =============================================================================
-- Auditoría de acciones superadmin sobre clientes (aditiva)
-- Sin FK CASCADE: preserva historial aunque se elimine la empresa en el futuro.
-- =============================================================================

-- archived_at en flags (por si 058 no se aplicó aún en algún entorno)
ALTER TABLE admin_data_audit_flags
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_admin_data_audit_flags_archived_at
  ON admin_data_audit_flags (archived_at)
  WHERE archived_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS admin_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  actor_email TEXT,
  company_id UUID NOT NULL,
  company_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_type TEXT NOT NULL,
  previous_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_action_logs_company_created
  ON admin_action_logs (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_action_logs_action_type
  ON admin_action_logs (action_type, created_at DESC);

COMMENT ON TABLE admin_action_logs IS
  'Registro de acciones seguras del superadmin sobre cuentas cliente (sin FK CASCADE).';
