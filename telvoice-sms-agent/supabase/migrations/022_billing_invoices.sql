-- =============================================================================
-- Billing — comprobantes/facturas (Etapa 12.1)
-- Migración ADITIVA: crea tablas billing_* para documentos comerciales.
-- NO activa RLS, NO integra SII, NO toca wallets/pagos existentes.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- billing_invoices: documento principal por orden (por ahora 1:1 con sms_orders)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES sms_orders (id) ON DELETE RESTRICT,

  invoice_number TEXT UNIQUE,
  document_type TEXT NOT NULL DEFAULT 'purchase_receipt',
  tax_document_type TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  payment_status TEXT NOT NULL DEFAULT 'pending',

  currency TEXT NOT NULL DEFAULT 'CLP',
  subtotal_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(8, 4) NOT NULL DEFAULT 0,

  -- Snapshot cliente (para auditoría; puede diferir de companies con el tiempo)
  customer_name TEXT,
  customer_legal_name TEXT,
  customer_tax_id TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  customer_city TEXT,
  customer_commune TEXT,
  customer_business_activity TEXT,
  customer_country TEXT NOT NULL DEFAULT 'CL',

  issued_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  pdf_url TEXT,
  html_url TEXT,

  -- Futuro proveedor tributario / SII (no usado en esta etapa)
  provider TEXT,
  provider_document_id TEXT,
  provider_status TEXT,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT billing_invoices_status_check CHECK (
    status IN (
      'draft',
      'pending_issue',
      'issued',
      'sent',
      'paid',
      'cancelled',
      'failed',
      'voided'
    )
  ),
  CONSTRAINT billing_invoices_document_type_check CHECK (
    document_type IN (
      'purchase_receipt',
      'invoice',
      'tax_invoice',
      'credit_note',
      'manual_receipt'
    )
  ),
  CONSTRAINT billing_invoices_payment_status_check CHECK (
    payment_status IN ('pending', 'paid', 'rejected', 'cancelled', 'refunded', 'manual')
  ),
  CONSTRAINT billing_invoices_amounts_non_negative CHECK (
    subtotal_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0 AND tax_rate >= 0
  )
);

-- En esta etapa: una orden => un documento principal (purchase_receipt).
-- Si en el futuro se habilitan credit_note por order_id, se migrará esta restricción.
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_invoices_order_unique
  ON billing_invoices (order_id);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_company_id
  ON billing_invoices (company_id);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_status
  ON billing_invoices (status);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_created_at
  ON billing_invoices (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_invoice_number
  ON billing_invoices (invoice_number);

DROP TRIGGER IF EXISTS trg_billing_invoices_updated_at ON billing_invoices;
CREATE TRIGGER trg_billing_invoices_updated_at
  BEFORE UPDATE ON billing_invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE billing_invoices IS 'Documentos comerciales (comprobante interno / futura factura tributaria)';

-- ---------------------------------------------------------------------------
-- billing_invoice_items: ítems del documento
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES billing_invoices (id) ON DELETE CASCADE,
  order_id UUID REFERENCES sms_orders (id) ON DELETE RESTRICT,
  package_id UUID REFERENCES sms_packages (id) ON DELETE SET NULL,

  description TEXT NOT NULL,
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT billing_invoice_items_amounts_non_negative CHECK (
    quantity >= 0 AND unit_price >= 0 AND subtotal >= 0 AND tax_amount >= 0 AND total >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_billing_invoice_items_invoice_id
  ON billing_invoice_items (invoice_id);

CREATE INDEX IF NOT EXISTS idx_billing_invoice_items_order_id
  ON billing_invoice_items (order_id);

CREATE INDEX IF NOT EXISTS idx_billing_invoice_items_package_id
  ON billing_invoice_items (package_id);

-- Idempotencia items: por ahora, 1 ítem principal por invoice+order+package.
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_invoice_items_invoice_order_package_unique
  ON billing_invoice_items (invoice_id, order_id, package_id);

-- ---------------------------------------------------------------------------
-- billing_email_logs: registro de envíos (aún sin proveedor real)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES billing_invoices (id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies (id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  cc_email TEXT,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT,
  provider_message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT billing_email_logs_status_check CHECK (
    status IN ('pending', 'sent', 'failed', 'retrying')
  )
);

CREATE INDEX IF NOT EXISTS idx_billing_email_logs_invoice_id
  ON billing_email_logs (invoice_id);

CREATE INDEX IF NOT EXISTS idx_billing_email_logs_company_id
  ON billing_email_logs (company_id);

CREATE INDEX IF NOT EXISTS idx_billing_email_logs_status
  ON billing_email_logs (status);

CREATE INDEX IF NOT EXISTS idx_billing_email_logs_created_at
  ON billing_email_logs (created_at DESC);

-- ---------------------------------------------------------------------------
-- billing_events: timeline auditable (creación, envío, errores, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES billing_invoices (id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies (id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  description TEXT,
  actor_type TEXT,
  actor_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_invoice_id
  ON billing_events (invoice_id);

CREATE INDEX IF NOT EXISTS idx_billing_events_company_id
  ON billing_events (company_id);

CREATE INDEX IF NOT EXISTS idx_billing_events_event_type
  ON billing_events (event_type);

CREATE INDEX IF NOT EXISTS idx_billing_events_created_at
  ON billing_events (created_at DESC);

