#!/usr/bin/env node
/**
 * Cancela orden QA post-reset Licantravel (sin borrar).
 * node scripts/cancel-licantravel-qa-order.mjs
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const ORDER_ID = "a713f187-8f59-4e90-b781-eef4f1b5647c";
const EMAIL = "licantravel@gmail.com";
const AGENT = process.env.QA_AGENT_URL?.trim() || "https://agent.telvoice.cl";
const BOLSA = "204786a5-0e70-43d4-8339-8403ccf810c4";

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { data: before, error: readErr } = await sb
  .from("sms_orders")
  .select("*")
  .eq("id", ORDER_ID)
  .maybeSingle();

if (readErr) {
  console.error(readErr);
  process.exit(1);
}
if (!before) {
  console.error("orden no encontrada");
  process.exit(1);
}
if (before.payment_status === "paid") {
  console.error("orden ya pagada — abort");
  process.exit(1);
}

const cancelledAt = new Date().toISOString();
const meta = {
  ...(before.metadata ?? {}),
  qa_cancelled: true,
  qa_cancelled_reason: "pre_real_purchase_cleanup",
  qa_cancelled_at: cancelledAt,
  cancel_source: "qa_pre_real_purchase_cleanup",
};

const { data: updated, error: updErr } = await sb
  .from("sms_orders")
  .update({
    payment_status: "cancelled",
    metadata: meta,
  })
  .eq("id", ORDER_ID)
  .select(
    "id,payment_status,credit_status,claim_status,company_id,checkout_email,public_checkout_reference,metadata",
  )
  .single();

if (updErr) {
  console.error(updErr);
  process.exit(1);
}

const cs = process.env.DATABASE_URL?.trim();
const client = new pg.Client({
  connectionString: cs,
  ssl: cs?.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});
await client.connect();

const side = {
  wallet_tx: (
    await client.query(
      `SELECT count(*)::int c FROM wallet_transactions WHERE reference_id = $1`,
      [ORDER_ID],
    )
  ).rows[0].c,
  invoices: (
    await client.query(
      `SELECT count(*)::int c FROM billing_invoices WHERE order_id = $1`,
      [ORDER_ID],
    )
  ).rows[0].c,
  email_logs: (
    await client.query(
      `SELECT count(*)::int c FROM email_logs WHERE order_id = $1`,
      [ORDER_ID],
    )
  ).rows[0].c,
  pending_orders: (
    await client.query(
      `SELECT count(*)::int c FROM sms_orders
       WHERE lower(coalesce(checkout_email,'')) = $1 AND payment_status = 'pending'`,
      [EMAIL],
    )
  ).rows[0].c,
  companies: (
    await client.query(
      `SELECT count(*)::int c FROM companies WHERE lower(coalesce(billing_email,'')) = $1`,
      [EMAIL],
    )
  ).rows[0].c,
  all_orders: (
    await client.query(
      `SELECT id, payment_status, credit_status, claim_status, company_id,
              public_checkout_reference,
              metadata->>'qa_after_licantravel_reset' AS qa_reset,
              metadata->>'qa_cancelled' AS qa_cancelled
       FROM sms_orders WHERE lower(coalesce(checkout_email,'')) = $1
       ORDER BY created_at DESC`,
      [EMAIL],
    )
  ).rows,
};

await client.end();

const health = await fetch(`${AGENT}/health`).then((r) => r.json());
const products = await fetch(`${AGENT}/api/public/products`).then((r) => r.json());
const bolsa = (products.products ?? []).some((p) => p.package_id === BOLSA);

console.log(
  JSON.stringify(
    {
      cancelled_order: updated,
      side_effects: side,
      production: {
        health_ok: health.success === true,
        bolsa200_visible: bolsa,
      },
      ready_for_real_purchase:
        side.pending_orders === 0 &&
        side.companies === 0 &&
        side.wallet_tx === 0 &&
        side.invoices === 0 &&
        side.email_logs === 0,
    },
    null,
    2,
  ),
);
