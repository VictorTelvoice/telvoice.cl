-- =============================================================================
-- Compra rápida landing: órdenes sin empresa hasta claim Google (aditivo)
-- =============================================================================

ALTER TABLE sms_orders
  ALTER COLUMN company_id DROP NOT NULL;

-- Idempotencia: permitir re-ejecutar migración.
ALTER TABLE sms_orders DROP CONSTRAINT IF EXISTS sms_orders_credit_status_check_v2;
ALTER TABLE sms_orders DROP CONSTRAINT IF EXISTS sms_orders_credit_status_check;
ALTER TABLE sms_orders ADD CONSTRAINT sms_orders_credit_status_check_v2 CHECK (
  credit_status IN ('pending', 'pending_claim', 'credited', 'failed', 'reversed')
);

ALTER TABLE sms_orders ADD COLUMN IF NOT EXISTS claim_token_hash TEXT;
ALTER TABLE sms_orders ADD COLUMN IF NOT EXISTS claim_status TEXT;
ALTER TABLE sms_orders ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ;
ALTER TABLE sms_orders ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE sms_orders ADD COLUMN IF NOT EXISTS claimed_by_user_id UUID;
ALTER TABLE sms_orders ADD COLUMN IF NOT EXISTS checkout_email TEXT;
ALTER TABLE sms_orders ADD COLUMN IF NOT EXISTS payer_email TEXT;
ALTER TABLE sms_orders ADD COLUMN IF NOT EXISTS public_checkout_reference TEXT;

ALTER TABLE sms_orders DROP CONSTRAINT IF EXISTS sms_orders_claim_status_check;
ALTER TABLE sms_orders ADD CONSTRAINT sms_orders_claim_status_check CHECK (
  claim_status IS NULL
  OR claim_status IN ('unclaimed', 'claimed', 'manual_review', 'expired')
);

CREATE INDEX IF NOT EXISTS idx_sms_orders_claim_token_hash
  ON sms_orders (claim_token_hash)
  WHERE claim_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_orders_public_checkout_ref
  ON sms_orders (public_checkout_reference)
  WHERE public_checkout_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_orders_pending_claim
  ON sms_orders (payment_status, credit_status, claim_status)
  WHERE credit_status = 'pending_claim';

COMMENT ON COLUMN sms_orders.claim_token_hash IS 'SHA-256 hex del claim_token (nunca almacenar el token en claro)';
COMMENT ON COLUMN sms_orders.public_checkout_reference IS 'Referencia corta para success page / soporte';
