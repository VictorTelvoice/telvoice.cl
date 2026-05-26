-- =============================================================================
-- Contactos y agendas (Etapa Contactos 2)
-- Migración ADITIVA: contact_lists, contacts, members, tags.
-- NO activa RLS. NO toca wallet, billing, campañas ni sms_messages.
-- phone_normalized: formato E.164 Chile móvil +569XXXXXXXX (12 dígitos tras +).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- contact_lists (agendas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contact_lists_status_check CHECK (
    status IN ('active', 'archived')
  )
);

CREATE INDEX IF NOT EXISTS idx_contact_lists_company_id
  ON contact_lists (company_id);

CREATE INDEX IF NOT EXISTS idx_contact_lists_company_status
  ON contact_lists (company_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_lists_company_name_lower_unique
  ON contact_lists (company_id, lower(name));

DROP TRIGGER IF EXISTS trg_contact_lists_updated_at ON contact_lists;
CREATE TRIGGER trg_contact_lists_updated_at
  BEFORE UPDATE ON contact_lists
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  display_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone_normalized TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'manual',
  notes TEXT,
  consent_status TEXT NOT NULL DEFAULT 'unknown',
  opt_out_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contacts_status_check CHECK (
    status IN ('active', 'incomplete', 'blocked', 'duplicate', 'opt_out')
  ),
  CONSTRAINT contacts_source_check CHECK (
    source IN ('manual', 'import', 'api', 'web')
  ),
  CONSTRAINT contacts_consent_status_check CHECK (
    consent_status IN ('unknown', 'granted', 'denied')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_company_phone_normalized_unique
  ON contacts (company_id, phone_normalized);

CREATE INDEX IF NOT EXISTS idx_contacts_company_id
  ON contacts (company_id);

CREATE INDEX IF NOT EXISTS idx_contacts_company_phone_normalized
  ON contacts (company_id, phone_normalized);

CREATE INDEX IF NOT EXISTS idx_contacts_company_status
  ON contacts (company_id, status);

CREATE INDEX IF NOT EXISTS idx_contacts_company_source
  ON contacts (company_id, source);

CREATE INDEX IF NOT EXISTS idx_contacts_company_created_at
  ON contacts (company_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_contacts_updated_at ON contacts;
CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- contact_list_members
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_list_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  list_id UUID NOT NULL REFERENCES contact_lists (id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT contact_list_members_unique UNIQUE (list_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_list_members_company_list
  ON contact_list_members (company_id, list_id);

CREATE INDEX IF NOT EXISTS idx_contact_list_members_company_contact
  ON contact_list_members (company_id, contact_id);

-- ---------------------------------------------------------------------------
-- contact_tags
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_tags_company_id
  ON contact_tags (company_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_tags_company_name_lower_unique
  ON contact_tags (company_id, lower(name));

-- ---------------------------------------------------------------------------
-- contact_tag_assignments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_tag_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES contact_tags (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contact_tag_assignments_unique UNIQUE (contact_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_tag_assignments_company_contact
  ON contact_tag_assignments (company_id, contact_id);

CREATE INDEX IF NOT EXISTS idx_contact_tag_assignments_company_tag
  ON contact_tag_assignments (company_id, tag_id);

COMMENT ON TABLE contact_lists IS 'Agendas/listas de contactos por empresa';
COMMENT ON TABLE contacts IS 'Contactos SMS por empresa (multi-tenant)';
COMMENT ON COLUMN contacts.phone_normalized IS 'E.164 Chile móvil: +569XXXXXXXX';
