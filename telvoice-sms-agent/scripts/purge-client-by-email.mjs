#!/usr/bin/env node
/**
 * Elimina todos los registros de un cliente por email (QA / prueba flujo nuevo).
 *
 * Uso:
 *   node scripts/purge-client-by-email.mjs --email=goclubai@gmail.com
 *   node scripts/purge-client-by-email.mjs --email=goclubai@gmail.com --apply
 */
import "dotenv/config";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const emailArg = process.argv.find((a) => a.startsWith("--email="));
const email = emailArg?.split("=")[1]?.trim().toLowerCase();

if (!email?.includes("@")) {
  console.error("Uso: node scripts/purge-client-by-email.mjs --email=correo@dominio.com [--apply]");
  process.exit(1);
}

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

async function count(sql, params = []) {
  const { rows } = await client.query(sql, params);
  return Number(rows[0]?.n ?? 0);
}

const companies = (
  await client.query(
    `
    SELECT id, name, status, billing_email, created_at
    FROM companies
    WHERE lower(trim(billing_email)) = $1
       OR id IN (
         SELECT company_id FROM user_profiles
         WHERE lower(trim(email)) = $1 AND company_id IS NOT NULL
       )
    ORDER BY created_at
    `,
    [email],
  )
).rows;

const profiles = (
  await client.query(
    `SELECT id, admin_user_id, company_id, user_id FROM user_profiles WHERE lower(trim(email)) = $1`,
    [email],
  )
).rows;

const admins = (
  await client.query(
    `SELECT id, email, role FROM admin_users WHERE lower(trim(email)) = $1`,
    [email],
  )
).rows;

const companyIds = companies.map((c) => c.id);
const adminIds = admins.map((a) => a.id);
const profileIds = profiles.map((p) => p.id);
const supabaseUserIds = profiles.map((p) => p.user_id).filter(Boolean);

const orders =
  companyIds.length > 0
    ? (
        await client.query(
          `
          SELECT id, company_id, payment_status, credit_status, sms_quantity, amount, created_at
          FROM sms_orders
          WHERE lower(trim(checkout_email)) = $1
             OR lower(trim(payer_email)) = $1
             OR company_id = ANY($2::uuid[])
          ORDER BY created_at
          `,
          [email, companyIds],
        )
      ).rows
    : (
        await client.query(
          `
          SELECT id, company_id, payment_status, credit_status, sms_quantity, amount, created_at
          FROM sms_orders
          WHERE lower(trim(checkout_email)) = $1 OR lower(trim(payer_email)) = $1
          ORDER BY created_at
          `,
          [email],
        )
      ).rows;

const orderIds = orders.map((o) => o.id);

const plan = {
  email,
  mode: apply ? "apply" : "dry-run",
  companies,
  profiles,
  admins,
  orders,
  counts: {},
};

if (orderIds.length) {
  plan.counts.billing_invoices = await count(
    `SELECT COUNT(*)::int AS n FROM billing_invoices WHERE order_id = ANY($1::uuid[]) OR company_id = ANY($2::uuid[])`,
    [orderIds, companyIds],
  );
  plan.counts.email_logs = await count(
    `SELECT COUNT(*)::int AS n FROM email_logs WHERE lower(recipient_email) = $1 OR order_id = ANY($2::uuid[]) OR company_id = ANY($3::uuid[])`,
    [email, orderIds, companyIds],
  );
}
if (companyIds.length) {
  const companyIdTexts = companyIds.map(String);
  const orderIdTexts = orderIds.map(String);
  plan.counts.wallet_transactions = await count(
    `SELECT COUNT(*)::int AS n FROM wallet_transactions WHERE company_id = ANY($1::uuid[])`,
    [companyIds],
  );
  plan.counts.admin_data_audit_flags = await count(
    `SELECT COUNT(*)::int AS n FROM admin_data_audit_flags
     WHERE (entity_type = 'company' AND entity_id = ANY($1::text[]))
        OR (entity_type = 'sms_order' AND entity_id = ANY($2::text[]))`,
    [companyIdTexts, orderIdTexts],
  );
}

console.log(JSON.stringify(plan, null, 2));

if (!apply) {
  console.log("\nDry-run. Agrega --apply para eliminar.");
  await client.end();
  process.exit(0);
}

if (
  companies.length === 0 &&
  profiles.length === 0 &&
  admins.length === 0 &&
  orders.length === 0
) {
  console.log("Nada que eliminar.");
  await client.end();
  process.exit(0);
}

await client.query("BEGIN");
try {
  if (orderIds.length || companyIds.length) {
    await client.query(
      `DELETE FROM email_logs
       WHERE lower(recipient_email) = $1
          OR order_id = ANY($2::uuid[])
          OR company_id = ANY($3::uuid[])`,
      [email, orderIds, companyIds],
    );
  }

  if (orderIds.length || companyIds.length) {
    const inv = await client.query(
      `SELECT id FROM billing_invoices WHERE order_id = ANY($1::uuid[]) OR company_id = ANY($2::uuid[])`,
      [orderIds, companyIds],
    );
    const invoiceIds = inv.rows.map((r) => r.id);
    if (invoiceIds.length) {
      await client.query(`DELETE FROM billing_email_logs WHERE invoice_id = ANY($1::uuid[])`, [
        invoiceIds,
      ]);
      await client.query(`DELETE FROM billing_invoices WHERE id = ANY($1::uuid[])`, [invoiceIds]);
    }
  }

  if (companyIds.length) {
    await client.query(
      `DELETE FROM admin_data_audit_flags WHERE entity_type = 'company' AND entity_id = ANY($1::text[])`,
      [companyIds.map(String)],
    );
  }
  if (orderIds.length) {
    await client.query(
      `DELETE FROM admin_data_audit_flags WHERE entity_type = 'sms_order' AND entity_id = ANY($1::text[])`,
      [orderIds.map(String)],
    );
    await client.query(`DELETE FROM agent_sales_events WHERE order_id = ANY($1::uuid[])`, [orderIds]);
  }

  if (orderIds.length) {
    await client.query(`DELETE FROM sms_orders WHERE id = ANY($1::uuid[])`, [orderIds]);
  }

  if (profileIds.length) {
    await client.query(`DELETE FROM user_profiles WHERE id = ANY($1::uuid[])`, [profileIds]);
  }
  if (adminIds.length) {
    await client.query(`DELETE FROM admin_users WHERE id = ANY($1::uuid[])`, [adminIds]);
  }
  if (companyIds.length) {
    await client.query(`DELETE FROM companies WHERE id = ANY($1::uuid[])`, [companyIds]);
  }

  await client.query("COMMIT");
  console.log("\nEliminación en Postgres OK.");
} catch (err) {
  await client.query("ROLLBACK");
  console.error("Rollback:", err.message);
  await client.end();
  process.exit(1);
}

await client.end();

const url = process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (url && serviceKey && supabaseUserIds.length) {
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const uid of supabaseUserIds) {
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (error) {
      console.warn(`Supabase auth deleteUser ${uid}:`, error.message);
    } else {
      console.log(`Supabase auth user eliminado: ${uid}`);
    }
  }
} else if (supabaseUserIds.length) {
  console.warn("Sin SUPABASE_URL/SERVICE_ROLE_KEY — usuario auth no eliminado:", supabaseUserIds);
}

console.log(JSON.stringify({ ok: true, email, deleted: { companies: companyIds.length, orders: orderIds.length, profiles: profileIds.length, admins: adminIds.length } }, null, 2));
