-- =============================================================================
-- Plantillas SMS — panel cliente
-- Migración ADITIVA. NO activa RLS (mismo patrón que soporte/contactos).
-- =============================================================================

CREATE TABLE IF NOT EXISTS client_sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  user_id UUID NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Activa',
  message TEXT NOT NULL,
  character_count INTEGER NOT NULL DEFAULT 0,
  sms_segments INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'client_panel',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_sms_templates_category_check CHECK (
    category IN (
      'OTP',
      'Transaccional',
      'Marketing',
      'Recordatorio',
      'Interno',
      'Soporte'
    )
  ),
  CONSTRAINT client_sms_templates_status_check CHECK (
    status IN ('Activa', 'Borrador')
  )
);

CREATE INDEX IF NOT EXISTS idx_client_sms_templates_company_id
  ON client_sms_templates (company_id);

CREATE INDEX IF NOT EXISTS idx_client_sms_templates_status
  ON client_sms_templates (status);

CREATE INDEX IF NOT EXISTS idx_client_sms_templates_category
  ON client_sms_templates (category);

CREATE INDEX IF NOT EXISTS idx_client_sms_templates_company_updated
  ON client_sms_templates (company_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_client_sms_templates_updated_at ON client_sms_templates;
CREATE TRIGGER trg_client_sms_templates_updated_at
  BEFORE UPDATE ON client_sms_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (opcional — NO habilitado por defecto)
-- ALTER TABLE client_sms_templates ENABLE ROW LEVEL SECURITY;
-- ---------------------------------------------------------------------------
