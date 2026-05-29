-- =============================================================================
-- Tickets de soporte — panel cliente (Etapa Soporte Supabase)
-- Migración ADITIVA. NO activa RLS (mismo patrón que contacts).
-- El panel usa service role vía getSupabase(); políticas RLS opcionales abajo.
-- NO toca wallet, billing, órdenes ni MercadoPago.
-- =============================================================================

CREATE TABLE IF NOT EXISTS client_support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  user_id UUID NULL,
  ticket_code TEXT NOT NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Abierto',
  message TEXT NOT NULL,
  replies JSONB NOT NULL DEFAULT '[]'::jsonb,
  attachment_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'client_panel',
  related_order_id UUID NULL REFERENCES sms_orders (id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_support_tickets_category_check CHECK (
    category IN (
      'Compra y pago',
      'Saldo SMS',
      'Campañas y envíos',
      'API / Webhook',
      'Entregabilidad SMS',
      'Facturación',
      'Configuración de cuenta',
      'SMPP / Alto volumen',
      'Otro'
    )
  ),
  CONSTRAINT client_support_tickets_priority_check CHECK (
    priority IN ('Baja', 'Media', 'Alta', 'Urgente')
  ),
  CONSTRAINT client_support_tickets_status_check CHECK (
    status IN ('Abierto', 'En revisión', 'Esperando respuesta', 'Resuelto')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_support_tickets_company_code
  ON client_support_tickets (company_id, ticket_code);

CREATE INDEX IF NOT EXISTS idx_client_support_tickets_company_id
  ON client_support_tickets (company_id);

CREATE INDEX IF NOT EXISTS idx_client_support_tickets_company_status
  ON client_support_tickets (company_id, status);

CREATE INDEX IF NOT EXISTS idx_client_support_tickets_company_priority
  ON client_support_tickets (company_id, priority);

CREATE INDEX IF NOT EXISTS idx_client_support_tickets_company_updated
  ON client_support_tickets (company_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_client_support_tickets_updated_at ON client_support_tickets;
CREATE TRIGGER trg_client_support_tickets_updated_at
  BEFORE UPDATE ON client_support_tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (opcional — NO habilitado por defecto para no bloquear el panel actual)
-- Cuando el panel use JWT de Supabase con company_id en claims, habilitar:
--
-- ALTER TABLE client_support_tickets ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY client_support_tickets_select_own ON client_support_tickets
--   FOR SELECT USING (
--     company_id IN (
--       SELECT company_id FROM user_profiles
--       WHERE user_id = auth.uid() AND status = 'active'
--     )
--   );
-- (replicar INSERT/UPDATE con la misma condición)
-- ---------------------------------------------------------------------------
