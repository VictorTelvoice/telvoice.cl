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
    AND NOT EXISTS (
      SELECT 1 FROM user_profiles p WHERE p.company_id = cs.id
    )
  ORDER BY cs.email_norm, cs.created_at
  `,
  filterEmail ? [filterEmail] : [],
);

const blockedOrphans = (
  await client.query(
    `
    SELECT c.id, c.name, lower(trim(c.billing_email)) AS email_norm, c.status, c.created_at
    FROM companies c
    WHERE c.status = 'blocked'
      AND COALESCE(c.metadata->>'duplicate_orphan', 'false') = 'true'
      ${filterEmail ? "AND lower(trim(c.billing_email)) = $1" : ""}
    ORDER BY c.created_at
    `,
    filterEmail ? [filterEmail] : [],
  )
).rows;

console.log(
  JSON.stringify(
    {
      mode: apply ? "apply" : "dry-run",
      filterEmail,
      orphanCount: rows.length,
      orphans: rows,
      blockedOrphanCount: blockedOrphans.length,
      blockedOrphans,
    },
    null,
    2,
  ),
);

const toRemove = [...rows, ...blockedOrphans];

if (!apply || toRemove.length === 0) {
  await client.end();
  process.exit(0);
}

let removed = 0;
for (const row of toRemove) {
  const emailNorm = row.email_norm;
  const keep = await client.query(
    `
    SELECT id FROM companies c
    WHERE lower(trim(c.billing_email)) = $1
      AND c.id <> $2
    ORDER BY
      (SELECT COUNT(*) FROM sms_orders o WHERE o.company_id = c.id) DESC,
      COALESCE(
        (SELECT COALESCE(w.available_sms,0)+COALESCE(w.total_purchased_sms,0)
         FROM company_sms_wallets w WHERE w.company_id = c.id LIMIT 1),
        0
      ) DESC,
      c.created_at ASC
    LIMIT 1
    `,
    [emailNorm, row.id],
  );
  const keepId = keep.rows[0]?.id ?? null;

  await client.query(`DELETE FROM companies WHERE id = $1`, [row.id]);
  removed += 1;
  console.log(`deleted orphan ${row.id} (${emailNorm}) → keep ${keepId}`);
}

console.log(JSON.stringify({ removed }, null, 2));
await client.end();
