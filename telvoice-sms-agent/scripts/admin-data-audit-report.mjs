#!/usr/bin/env node
/**
 * Reporte read-only de auditoría de datos superadmin (FASE 1).
 * No modifica ningún dato en producción.
 *
 * Uso:
 *   node scripts/admin-data-audit-report.mjs
 *   node scripts/admin-data-audit-report.mjs --out=reports/audit.json
 *   node scripts/admin-data-audit-report.mjs --client=arturo.aguilar@talkchile.cl
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROTECTED_EMAILS = new Set(["arturo.aguilar@talkchile.cl"]);

const TABLE_SPECS = [
  { table: "companies", select: "id, name, billing_email, status, created_at" },
  {
    table: "user_profiles",
    select: "id, user_id, company_id, full_name, email, role, status, created_at",
  },
  {
    table: "sms_orders",
    select:
      "id, company_id, checkout_email, payer_email, payment_status, credit_status, payment_provider, created_at",
  },
  {
    table: "company_sms_wallets",
    select: "id, company_id, available_sms, consumed_sms, status, created_at",
  },
  {
    table: "wallet_transactions",
    select: "id, company_id, wallet_id, type, sms_amount, reference_type, created_at",
  },
  {
    table: "billing_invoices",
    select: "id, company_id, order_id, invoice_number, status, payment_status, created_at",
  },
  {
    table: "billing_events",
    select: "id, company_id, invoice_id, event_type, created_at",
  },
  {
    table: "email_logs",
    select: "id, company_id, order_id, recipient_email, template_key, status, created_at",
  },
  {
    table: "billing_email_logs",
    select: "id, company_id, invoice_id, to_email, email_type, status, created_at",
  },
  {
    table: "sms_campaigns",
    select: "id, company_id, name, status, mode, created_at",
  },
  {
    table: "panel_sms_messages",
    select: "id, company_id, campaign_id, status, mode, sent_at, created_at",
  },
  {
    table: "panel_sms_delivery_events",
    select: "id, message_id, status, created_at",
  },
  { table: "sms_dlr_events", select: "id, sms_message_id, dlr_status, created_at" },
  {
    table: "sms_send_queue",
    select: "id, company_id, campaign_id, status, created_at",
  },
  {
    table: "contacts",
    select: "id, company_id, display_name, phone, status, source, created_at",
  },
  { table: "contact_lists", select: "id, company_id, name, status, created_at" },
  {
    table: "client_support_tickets",
    select: "id, company_id, ticket_code, subject, status, created_at",
  },
  {
    table: "client_sms_templates",
    select: "id, company_id, name, category, status, created_at",
  },
  {
    table: "wholesale_providers",
    select: "id, name, code, connection_type, status, created_at",
  },
  {
    table: "wholesale_customers",
    select: "id, company_name, email, commercial_status, created_at",
  },
  {
    table: "wholesale_opportunities",
    select: "id, customer_id, country_code, commercial_status, created_at",
  },
  {
    table: "wholesale_routes",
    select: "id, provider_id, country_code, status, created_at",
  },
  { table: "sms_providers", select: "id, name, code, type, status, created_at" },
  { table: "sms_rate_plans", select: "id, name, code, status, created_at" },
];

function arg(name) {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : null;
}

const outPath = arg("out");
const clientEmail = arg("client")?.trim().toLowerCase() ?? null;

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

const db = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});
await db.connect();

const tables = [];
for (const spec of TABLE_SPECS) {
  const countR = await db.query(`SELECT count(*)::int AS c FROM ${spec.table}`);
  const sampleR = await db.query(
    `SELECT ${spec.select} FROM ${spec.table} ORDER BY created_at DESC NULLS LAST LIMIT 5`,
  );
  tables.push({
    table: spec.table,
    total: countR.rows[0]?.c ?? 0,
    samples: sampleR.rows,
  });
}

let protectedClient = null;
if (clientEmail || PROTECTED_EMAILS.size > 0) {
  const email = clientEmail ?? [...PROTECTED_EMAILS][0];
  const profile = (
    await db.query(
      `SELECT * FROM user_profiles WHERE lower(email) = $1 LIMIT 1`,
      [email],
    )
  ).rows[0];
  const company = (
    await db.query(
      `SELECT * FROM companies WHERE lower(coalesce(billing_email,'')) = $1
       ORDER BY created_at DESC LIMIT 1`,
      [email],
    )
  ).rows[0];
  const companyId = company?.id ?? profile?.company_id ?? null;
  const orders = companyId
    ? (
        await db.query(
          `SELECT id, payment_status, credit_status, claim_status, amount, created_at
           FROM sms_orders WHERE company_id = $1 ORDER BY created_at DESC`,
          [companyId],
        )
      ).rows
    : (
        await db.query(
          `SELECT id, payment_status, credit_status, claim_status, amount, created_at
           FROM sms_orders
           WHERE lower(coalesce(checkout_email,'')) = $1
              OR lower(coalesce(payer_email,'')) = $1
           ORDER BY created_at DESC`,
          [email],
        )
      ).rows;
  const wallet = companyId
    ? (
        await db.query(
          `SELECT * FROM company_sms_wallets WHERE company_id = $1 LIMIT 1`,
          [companyId],
        )
      ).rows[0]
    : null;
  const purchaseCredits = companyId
    ? (
        await db.query(
          `SELECT id, type, sms_amount, created_at FROM wallet_transactions
           WHERE company_id = $1 AND type = 'purchase_credit' ORDER BY created_at`,
          [companyId],
        )
      ).rows
    : [];
  const invoices =
    orders.length > 0
      ? (
          await db.query(
            `SELECT id, invoice_number, status, payment_status, created_at
             FROM billing_invoices WHERE order_id = ANY($1::uuid[])`,
            [orders.map((o) => o.id)],
          )
        ).rows
      : [];
  const billingEmails =
    invoices.length > 0
      ? (
          await db.query(
            `SELECT id, to_email, email_type, status, subject, created_at
             FROM billing_email_logs WHERE invoice_id = ANY($1::uuid[])
             ORDER BY created_at`,
            [invoices.map((i) => i.id)],
          )
        ).rows
      : [];
  const messages = companyId
    ? (
        await db.query(
          `SELECT id, recipient_number, status, mode, sent_at FROM panel_sms_messages
           WHERE company_id = $1 ORDER BY created_at DESC LIMIT 20`,
          [companyId],
        )
      ).rows
    : [];

  protectedClient = {
    email,
    protected: PROTECTED_EMAILS.has(email),
    profile,
    company,
    orders,
    wallet,
    purchaseCredits,
    invoices,
    billingEmails,
    messages,
    integrity: {
      duplicateCredits: purchaseCredits.length > 1,
      duplicateInvoices: invoices.length > 1,
      duplicateReceiptEmails:
        billingEmails.filter((e) => e.status === "sent" && e.email_type === "purchase_receipt")
          .length > 1,
      walletCreditedOnce: purchaseCredits.length === 1,
    },
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  mode: "read_only",
  tables,
  protectedClient,
  totals: Object.fromEntries(tables.map((t) => [t.table, t.total])),
};

const json = JSON.stringify(report, null, 2);
if (outPath) {
  const abs = join(process.cwd(), outPath);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, json, "utf8");
  console.error(`Reporte guardado en ${abs}`);
}
console.log(json);
await db.end();
