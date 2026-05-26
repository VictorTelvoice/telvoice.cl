-- =============================================================================
-- Contactos: trabajos de importación CSV (Etapa 3)
-- Migración ADITIVA. Sin RLS.
-- =============================================================================

CREATE TABLE IF NOT EXISTS contact_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  filename TEXT,
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  invalid_rows INTEGER NOT NULL DEFAULT 0,
  duplicate_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contact_import_jobs_status_check CHECK (
    status IN ('draft', 'validated', 'imported', 'failed', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_contact_import_jobs_company_id
  ON contact_import_jobs (company_id);

CREATE INDEX IF NOT EXISTS idx_contact_import_jobs_company_status
  ON contact_import_jobs (company_id, status);

CREATE INDEX IF NOT EXISTS idx_contact_import_jobs_company_created
  ON contact_import_jobs (company_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_contact_import_jobs_updated_at ON contact_import_jobs;
CREATE TRIGGER trg_contact_import_jobs_updated_at
  BEFORE UPDATE ON contact_import_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS contact_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES contact_import_jobs (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  display_name TEXT,
  phone TEXT,
  phone_normalized TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  duplicate_contact_id UUID REFERENCES contacts (id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contact_import_rows_status_check CHECK (
    status IN ('pending', 'valid', 'invalid', 'duplicate', 'imported', 'skipped')
  )
);

CREATE INDEX IF NOT EXISTS idx_contact_import_rows_job_id
  ON contact_import_rows (job_id);

CREATE INDEX IF NOT EXISTS idx_contact_import_rows_company_job
  ON contact_import_rows (company_id, job_id);

COMMENT ON TABLE contact_import_jobs IS 'Trabajos de importación CSV de contactos por empresa';
COMMENT ON TABLE contact_import_rows IS 'Filas parseadas/validadas de un trabajo de importación';
