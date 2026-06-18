#!/usr/bin/env node
/**
 * Conserva la mejor empresa por billing_email y elimina duplicados vacíos/QA.
 *
 * Uso:
 *   node scripts/dedupe-companies-by-billing-email.mjs
 *   node scripts/dedupe-companies-by-billing-email.mjs --apply
 *   node scripts/dedupe-companies-by-billing-email.mjs --apply --email=victor@telvoice.net
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

const { rows: companies } = await client.query(
  `
  SELECT
    c.id,
    c.name,
    lower(trim(c.billing_email)) AS email_norm,
    c.status,
    c.created_at,
    COALESCE((SELECT COUNT(*)::int FROM user_profiles p WHERE p.company_id = c.id), 0) AS profile_count,
    COALESCE((SELECT COUNT(*)::int FROM sms_orders o WHERE o.company_id = c.id), 0) AS order_count,
    COALESCE(
      (SELECT COUNT(*)::int FROM sms_orders o WHERE o.company_id = c.id AND o.payment_status = 'paid'),
      0
    ) AS paid_order_count,
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
    ) AS wallet_score
  FROM companies c
  WHERE c.billing_email IS NOT NULL
    AND trim(c.billing_email) <> ''
    AND c.status = 'active'
    ${filterEmail ? "AND lower(trim(c.billing_email)) = $1" : ""}
  ORDER BY email_norm, created_at
  `,
  filterEmail ? [filterEmail] : [],
);

const byEmail = new Map();
for (const row of companies) {
  const list = byEmail.get(row.email_norm) ?? [];
  list.push(row);
  byEmail.set(row.email_norm, list);
}

function score(row) {
  return (
    row.profile_count * 100_000 +
    row.paid_order_count * 1_000 +
    row.order_count * 100 +
    row.wallet_score * 10
  );
}

const plan = [];
for (const [email, group] of byEmail) {
  if (group.length < 2) continue;
  const ranked = [...group].sort((a, b) => score(b) - score(a) || new Date(a.created_at) - new Date(b.created_at));
  const keep = ranked[0];
  const remove = ranked.slice(1).filter((row) => row.profile_count === 0);
  if (remove.length) {
    plan.push({ email, keep, remove });
  }
}

console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", filterEmail, plan }, null, 2));

if (!apply || plan.length === 0) {
  await client.end();
  process.exit(0);
}

async function deleteCompany(companyId) {
  const orders = await client.query(`SELECT id FROM sms_orders WHERE company_id = $1`, [companyId]);
  const orderIds = orders.rows.map((r) => r.id);

  if (orderIds.length) {
    await client.query(
      `DELETE FROM email_logs WHERE order_id = ANY($1::uuid[]) OR company_id = $2`,
      [orderIds, companyId],
    );
    const inv = await client.query(
      `SELECT id FROM billing_invoices WHERE company_id = $1 OR order_id = ANY($2::uuid[])`,
      [companyId, orderIds],
    );
    const invoiceIds = inv.rows.map((r) => r.id);
    if (invoiceIds.length) {
      await client.query(`DELETE FROM billing_email_logs WHERE invoice_id = ANY($1::uuid[])`, [invoiceIds]);
      await client.query(`DELETE FROM billing_invoices WHERE id = ANY($1::uuid[])`, [invoiceIds]);
    }
    await client.query(`DELETE FROM agent_sales_events WHERE order_id = ANY($1::uuid[])`, [orderIds]);
    await client.query(`DELETE FROM sms_orders WHERE id = ANY($1::uuid[])`, [orderIds]);
  }

  await client.query(
    `DELETE FROM admin_data_audit_flags WHERE entity_type = 'company' AND entity_id = $1`,
    [companyId],
  );
  await client.query(`DELETE FROM email_logs WHERE company_id = $1`, [companyId]);
  await client.query(`DELETE FROM companies WHERE id = $1`, [companyId]);
}

let removed = 0;
for (const group of plan) {
  for (const row of group.remove) {
    await deleteCompany(row.id);
    removed += 1;
    console.log(`deleted ${row.id} (${row.name}) — keep ${group.keep.id} (${group.keep.name})`);
  }
}

console.log(JSON.stringify({ removed }, null, 2));
await client.end();
