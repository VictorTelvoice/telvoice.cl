#!/usr/bin/env node
import "dotenv/config";
import pg from "pg";

const PAYMENT_ID = "161397987074";
const REF = "TV-MPPSFS4-839007";
const EMAIL = "licantravel@gmail.com";

const cs = process.env.DATABASE_URL?.trim();
const c = new pg.Client({
  connectionString: cs,
  ssl: cs?.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});
await c.connect();

const orders = (
  await c.query(
    `SELECT o.id, o.checkout_email, o.payment_status, o.credit_status, o.claim_status,
            o.company_id, o.public_checkout_reference, o.package_id, p.name AS package_name,
            o.sms_quantity, o.amount, o.claim_token_hash IS NOT NULL AS has_claim_hash,
            o.metadata->>'mercadopago_payment_id' AS mp_payment,
            o.metadata->>'mercadopago_preference_id' AS mp_pref
     FROM sms_orders o
     LEFT JOIN sms_packages p ON p.id = o.package_id
     WHERE o.metadata->>'mercadopago_payment_id' = $1
        OR o.public_checkout_reference = $2
        OR lower(coalesce(o.checkout_email, '')) = $3
     ORDER BY o.created_at DESC LIMIT 5`,
    [PAYMENT_ID, REF, EMAIL],
  )
).rows;

const orderIds = orders.map((o) => o.id);
const emailLogs = orderIds.length
  ? (
      await c.query(
        `SELECT id, template_key, status, provider_message_id, created_at
         FROM email_logs WHERE order_id = ANY($1::uuid[]) ORDER BY created_at`,
        [orderIds],
      )
    ).rows
  : [];

let walletCredits = 0;
if (orderIds.length) {
  walletCredits = (
    await c.query(
      `SELECT count(*)::int c FROM wallet_transactions
       WHERE reference_id = ANY($1::uuid[]) AND type = 'purchase_credit'`,
      [orderIds],
    )
  ).rows[0].c;
}

console.log(
  JSON.stringify(
    {
      orders,
      email_logs: emailLogs,
      wallet_purchase_credits: walletCredits,
      paid: orders.find((o) => o.payment_status === "paid"),
    },
    null,
    2,
  ),
);
await c.end();
