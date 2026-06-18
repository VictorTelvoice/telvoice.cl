-- =============================================================================
-- Evita empresas duplicadas por billing_email en checkout post-pago (Mercado Pago).
-- 1) Archiva huérfanas checkout sin órdenes ni saldo.
-- 2) Índice UNIQUE parcial solo en empresas post_payment_auto activas.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Archivar duplicados checkout post-pago (conservar empresa con órdenes/saldo)
-- ---------------------------------------------------------------------------
WITH company_stats AS (
  SELECT
    c.id,
    lower(trim(c.billing_email)) AS email_norm,
    COALESCE(
      (SELECT COUNT(*)::int FROM sms_orders o WHERE o.company_id = c.id),
      0
    ) AS order_count,
    COALESCE(
      (
        SELECT
          COALESCE(w.available_sms, 0)
          + COALESCE(w.total_purchased_sms, 0)
          + COALESCE(w.consumed_sms, 0)
        FROM company_sms_wallets w
        WHERE w.company_id = c.id
        LIMIT 1
      ),
      0
    ) AS wallet_score,
    ROW_NUMBER() OVER (
      PARTITION BY lower(trim(c.billing_email))
      ORDER BY
        (SELECT COUNT(*)::int FROM sms_orders o WHERE o.company_id = c.id) DESC,
        COALESCE(
          (
            SELECT
              COALESCE(w.available_sms, 0)
              + COALESCE(w.total_purchased_sms, 0)
              + COALESCE(w.consumed_sms, 0)
            FROM company_sms_wallets w
            WHERE w.company_id = c.id
            LIMIT 1
          ),
          0
        ) DESC,
        c.created_at ASC,
        c.id ASC
    ) AS rn
  FROM companies c
  WHERE c.billing_email IS NOT NULL
    AND trim(c.billing_email) <> ''
    AND c.status = 'active'
    AND COALESCE(c.metadata->>'account_creation_mode', '') = 'post_payment_auto'
),
duplicates AS (
  SELECT email_norm
  FROM company_stats
  GROUP BY email_norm
  HAVING COUNT(*) > 1
)
UPDATE companies c
SET
  status = 'blocked',
  metadata = COALESCE(c.metadata, '{}'::jsonb) || jsonb_build_object(
    'duplicate_orphan', true,
    'blocked_reason', 'checkout_provision_duplicate',
    'blocked_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'blocked_by', 'migration_064'
  ),
  updated_at = now()
FROM company_stats cs
JOIN duplicates d ON d.email_norm = cs.email_norm
WHERE c.id = cs.id
  AND cs.rn > 1
  AND cs.order_count = 0
  AND cs.wallet_score = 0;

-- ---------------------------------------------------------------------------
-- 2) Índice único: un billing_email activo por empresa de checkout automático
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_checkout_billing_email_unique
  ON companies (lower(trim(billing_email)))
  WHERE billing_email IS NOT NULL
    AND trim(billing_email) <> ''
    AND status = 'active'
    AND COALESCE(metadata->>'account_creation_mode', '') = 'post_payment_auto';

COMMENT ON INDEX idx_companies_checkout_billing_email_unique IS
  'Un correo no puede tener dos empresas activas creadas por checkout post-pago (evita carrera MP).';
