-- =============================================================================
-- Auditoría y clasificación de datos superadmin (aditiva)
-- No modifica tablas operativas; solo registra flags de limpieza segura.
-- =============================================================================

CREATE TABLE IF NOT EXISTS admin_data_audit_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  classification TEXT NOT NULL,
  reason TEXT,
  confidence NUMERIC(4, 3) NOT NULL DEFAULT 0.500,
  protected BOOLEAN NOT NULL DEFAULT false,
  reviewed BOOLEAN NOT NULL DEFAULT false,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_data_audit_flags_classification_check CHECK (
    classification IN (
      'PROD_REAL',
      'PROD_INTERNAL',
      'QA_TEST',
      'DEMO_SEED',
      'ORPHAN',
      'REVIEW_REQUIRED'
    )
  ),
  CONSTRAINT admin_data_audit_flags_entity_unique UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_data_audit_flags_classification
  ON admin_data_audit_flags (classification);

CREATE INDEX IF NOT EXISTS idx_admin_data_audit_flags_protected
  ON admin_data_audit_flags (protected)
  WHERE protected = true;

CREATE INDEX IF NOT EXISTS idx_admin_data_audit_flags_cleanup_candidates
  ON admin_data_audit_flags (entity_type, classification)
  WHERE protected = false
    AND classification IN ('QA_TEST', 'DEMO_SEED', 'ORPHAN');

DROP TRIGGER IF EXISTS trg_admin_data_audit_flags_updated_at ON admin_data_audit_flags;
CREATE TRIGGER trg_admin_data_audit_flags_updated_at
  BEFORE UPDATE ON admin_data_audit_flags
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE admin_data_audit_flags IS
  'Clasificación de datos para auditoría y limpieza segura del superadmin Telvoice.';
