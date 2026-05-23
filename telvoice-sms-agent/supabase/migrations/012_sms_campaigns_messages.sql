-- =============================================================================
-- Campañas y mensajes SMS por empresa (Etapa 9 — envío mock operacional)
-- ADITIVA: no modifica sms_messages legacy (client_id / aSMSC).
-- panel_sms_messages implementa el modelo company-scoped de mensajes del panel.
-- =============================================================================

CREATE TABLE IF NOT EXISTS sms_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sender_id TEXT,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  total_recipients INTEGER NOT NULL DEFAULT 0,
  valid_recipients INTEGER NOT NULL DEFAULT 0,
  invalid_recipients INTEGER NOT NULL DEFAULT 0,
  estimated_sms_cost INTEGER NOT NULL DEFAULT 0,
  real_sms_cost INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'mock',
  created_by UUID,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sms_campaigns_status_check CHECK (
    status IN ('draft', 'processing', 'sent', 'completed', 'failed', 'cancelled')
  ),
  CONSTRAINT sms_campaigns_mode_check CHECK (mode IN ('mock', 'live'))
);

CREATE INDEX IF NOT EXISTS idx_sms_campaigns_company_created
  ON sms_campaigns (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_campaigns_status
  ON sms_campaigns (company_id, status);

DROP TRIGGER IF EXISTS trg_sms_campaigns_updated_at ON sms_campaigns;
CREATE TRIGGER trg_sms_campaigns_updated_at
  BEFORE UPDATE ON sms_campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Mensajes outbound del panel /app (no confundir con public.sms_messages de aSMSC)
CREATE TABLE IF NOT EXISTS panel_sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES sms_campaigns (id) ON DELETE SET NULL,
  recipient_number TEXT NOT NULL,
  sender_id TEXT,
  message TEXT NOT NULL,
  segments INTEGER NOT NULL DEFAULT 1 CHECK (segments >= 1),
  cost_sms INTEGER NOT NULL DEFAULT 1 CHECK (cost_sms >= 1),
  provider TEXT NOT NULL DEFAULT 'mock',
  provider_message_id TEXT,
  operator TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  error_code TEXT,
  error_message TEXT,
  mode TEXT NOT NULL DEFAULT 'mock',
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT panel_sms_messages_status_check CHECK (
    status IN ('queued', 'sent', 'delivered', 'failed', 'rejected', 'expired', 'pending')
  ),
  CONSTRAINT panel_sms_messages_mode_check CHECK (mode IN ('mock', 'live'))
);

CREATE INDEX IF NOT EXISTS idx_panel_sms_messages_company_created
  ON panel_sms_messages (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_panel_sms_messages_campaign
  ON panel_sms_messages (campaign_id);

CREATE INDEX IF NOT EXISTS idx_panel_sms_messages_status
  ON panel_sms_messages (company_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_panel_sms_messages_provider_msg
  ON panel_sms_messages (provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_panel_sms_messages_updated_at ON panel_sms_messages;
CREATE TRIGGER trg_panel_sms_messages_updated_at
  BEFORE UPDATE ON panel_sms_messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS panel_sms_delivery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES panel_sms_messages (id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'mock',
  provider_message_id TEXT,
  status TEXT NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_panel_sms_delivery_events_message
  ON panel_sms_delivery_events (message_id, created_at DESC);

COMMENT ON TABLE sms_campaigns IS 'Campañas SMS del panel cliente por company_id';
COMMENT ON TABLE panel_sms_messages IS 'Mensajes SMS panel /app (Etapa 9); distinto de sms_messages legacy aSMSC';
COMMENT ON TABLE panel_sms_delivery_events IS 'Eventos DLR mock/live para panel_sms_messages';
