#!/usr/bin/env node
/**
 * Repara empresas duplicadas por billing_email (checkout post-pago).
 *
 * Uso:
 *   node scripts/dedupe-checkout-duplicate-companies.mjs           # dry-run
 *   node scripts/dedupe-checkout-duplicate-companies.mjs --apply   # aplica
 *   node scripts/dedupe-checkout-duplicate-companies.mjs --apply --email=fmem2033@gmail.com
 */
import "dotenv/config";
import pg from "pg";

const apply = process.argv.includes("--apply");
const emailArg = process.argv.find((a) => a.startsWith("--email="));
const filterEmail = emailArg ? emailArg.split("=")[1]?.trim().toLowerCase() : null;

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

await client.connect();

const { rows } = await client.query(
  `
  WITH company_stats AS (
    SELECT
      c.id,
      c.name,
      lower(trim(c.billing_email)) AS email_norm,
      c.status,
      c.created_at,
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
      ${filterEmail ? "AND lower(trim(c.billing_email)) = $1" : ""}
  ),
  duplicates AS (
    SELECT email_norm
    FROM company_stats
    GROUP BY email_norm
    HAVING COUNT(*) > 1
  )
  SELECT cs.*
  FROM company_stats cs
  JOIN duplicates d ON d.email_norm = cs.email_norm
  WHERE cs.rn > 1
    AND cs.order_count = 0
    AND cs.wallet_score = 0
  ORDER BY cs.email_norm, cs.created_at
  `,
  filterEmail ? [filterEmail] : [],
);

console.log(
  JSON.stringify(
    {
      mode: apply ? "apply" : "dry-run",
      filterEmail,
      orphanCount: rows.length,
      orphans: rows,
    },
    null,
    2,
  ),
);

if (!apply || rows.length === 0) {
  await client.end();
  process.exit(0);
}

let archived = 0;
for (const row of rows) {
  const keep = await client.query(
    `
    SELECT id FROM companies c
    WHERE lower(trim(c.billing_email)) = $1
      AND c.status = 'active'
      AND c.id <> $2
    ORDER BY
      (SELECT COUNT(*) FROM sms_orders o WHERE o.company_id = c.id) DESC,
      c.created_at ASC
    LIMIT 1
    `,
    [row.email_norm, row.id],
  );
  const keepId = keep.rows[0]?.id ?? null;

  await client.query(
    `
    UPDATE companies
    SET
      status = 'blocked',
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'duplicate_orphan', true,
        'blocked_reason', 'checkout_provision_duplicate',
        'merged_into_company_id', $2::text,
        'blocked_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'blocked_by', 'dedupe_script'
      ),
      updated_at = now()
    WHERE id = $1 AND status = 'active'
    `,
    [row.id, keepId],
  );
  archived += 1;
  console.log(`archived orphan ${row.id} (${row.email_norm}) → keep ${keepId}`);
}

console.log(JSON.stringify({ archived }, null, 2));
await client.end();
