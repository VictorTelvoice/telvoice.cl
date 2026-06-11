-- =============================================================================
-- Inventario de números reales Telvoice (venta online + preconfigurados)
-- NO incluye números E.164 — cargar vía script admin (no versionado).
-- =============================================================================

CREATE TABLE IF NOT EXISTS real_number_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  e164_number TEXT NOT NULL UNIQUE,
  country_code TEXT NOT NULL DEFAULT 'CL',
  provider TEXT NOT NULL DEFAULT 'telsim',
  webhook_connected BOOLEAN NOT NULL DEFAULT false,
  connection_status TEXT NOT NULL DEFAULT 'preconfigured_pending',
  sales_status TEXT NOT NULL DEFAULT 'preconfigured_pending',
  current_order_id UUID REFERENCES sms_orders (id) ON DELETE SET NULL,
  current_company_id UUID REFERENCES companies (id) ON DELETE SET NULL,
  current_client_number_id UUID REFERENCES client_numbers (id) ON DELETE SET NULL,
  current_agent_request_id UUID REFERENCES sim_activation_requests (id) ON DELETE SET NULL,
  reserved_until TIMESTAMPTZ,
  gateway_id TEXT,
  sim_slot TEXT,
  webhook_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT real_number_inventory_connection_status_check CHECK (
    connection_status IN (
      'connected',
      'preconfigured_pending',
      'connection_error',
      'disabled'
    )
  ),
  CONSTRAINT real_number_inventory_sales_status_check CHECK (
    sales_status IN (
      'connected_available',
      'preconfigured_pending',
      'not_for_sale',
      'reserved_pending_payment',
      'sold_pending_activation',
      'active_assigned',
      'suspended',
      'released'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_real_number_inventory_sales_status
  ON real_number_inventory (sales_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_real_number_inventory_connection_status
  ON real_number_inventory (connection_status, webhook_connected);

CREATE INDEX IF NOT EXISTS idx_real_number_inventory_order
  ON real_number_inventory (current_order_id)
  WHERE current_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_real_number_inventory_company
  ON real_number_inventory (current_company_id)
  WHERE current_company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_real_number_inventory_reserved_until
  ON real_number_inventory (reserved_until)
  WHERE sales_status = 'reserved_pending_payment';

DROP TRIGGER IF EXISTS trg_real_number_inventory_updated_at ON real_number_inventory;
CREATE TRIGGER trg_real_number_inventory_updated_at
  BEFORE UPDATE ON real_number_inventory
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE real_number_inventory IS
  'Inventario operativo de números reales Telvoice (telsim). Solo connected_available son vendibles online.';

-- ---------------------------------------------------------------------------

ALTER TABLE sim_activation_requests
  ADD COLUMN IF NOT EXISTS inventory_number_id UUID REFERENCES real_number_inventory (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sim_activation_requests_inventory
  ON sim_activation_requests (inventory_number_id)
  WHERE inventory_number_id IS NOT NULL;

COMMENT ON COLUMN sim_activation_requests.inventory_number_id IS
  'Número reservado del inventario real_number_inventory para esta compra.';
