#!/usr/bin/env node
/**
 * QA modal final: checkout sin pago, metadata qa_modal_final_check, sin side effects.
 */
import "dotenv/config";
import pg from "pg";

const AGENT = process.env.QA_AGENT_URL?.trim() || "https://agent.telvoice.cl";
const PLAN_STARTER = "d802050c-2c35-435b-acfe-8cb682980917";

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const ts = Date.now();
const qaEmail = `qa-modal-final+${ts}@telvoice.test`;

const checkoutRes = await fetch(`${AGENT}/api/public/checkout`, {
  method: "POST",
  headers: { "content-type": "application/json", Accept: "application/json" },
  body: JSON.stringify({
    package_id: PLAN_STARTER,
    checkout_email: qaEmail,
    payer_email: qaEmail,
    payer_name: "QA Modal Final",
    source: "landing",
  }),
});
const checkoutBody = await checkoutRes.json();
assert(checkoutRes.status === 201 && checkoutBody.success, JSON.stringify(checkoutBody));

const orderId = checkoutBody.order_id;
const checkoutUrl = String(checkoutBody.checkout_url ?? "");
assert(checkoutUrl.includes("pref_id=") || checkoutUrl.includes("pref_id"), "checkout_url sin pref_id");
assert(
  checkoutUrl.includes("mercadopago"),
  `checkout_url no parece MercadoPago: ${checkoutUrl.slice(0, 80)}`,
);
assert(checkoutBody.preference_id?.length > 5, "preference_id ausente");

const client = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});
await client.connect();
try {
  await client.query(
    `UPDATE sms_orders
     SET metadata = coalesce(metadata, '{}'::jsonb) || $2::jsonb
     WHERE id = $1`,
    [orderId, JSON.stringify({ qa_modal_final_check: true })],
  );

  const ord = (
    await client.query(
      `SELECT id, checkout_email, package_id, payment_status, credit_status, claim_status,
              company_id, public_checkout_reference, claim_token_hash, metadata
       FROM sms_orders WHERE id = $1`,
      [orderId],
    )
  ).rows[0];

  assert(ord.checkout_email === qaEmail, "checkout_email");
  assert(ord.metadata?.qa_modal_final_check === true, "qa_modal_final_check metadata");
  assert(ord.payment_status === "pending", "payment_status");
  assert(ord.credit_status === "pending_claim", "credit_status");
  assert(ord.claim_status === "unclaimed", "claim_status");
  assert(ord.company_id === null, "company_id");

  const walletTx = await client.query(
    `SELECT count(*)::int AS c FROM wallet_transactions
     WHERE reference_type = 'sms_order' AND reference_id = $1`,
    [orderId],
  );
  assert(walletTx.rows[0].c === 0, "wallet credit");

  let emailCount = 0;
  const emailTable = await client.query(
    `SELECT to_regclass('public.email_logs') IS NOT NULL AS ok`,
  );
  if (emailTable.rows[0]?.ok) {
    const col = await client.query(
      `SELECT count(*)::int AS c FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'email_logs' AND column_name = 'order_id'`,
    );
    if (col.rows[0]?.c > 0) {
      emailCount = (
        await client.query(`SELECT count(*)::int AS c FROM email_logs WHERE order_id = $1`, [
          orderId,
        ])
      ).rows[0].c;
    }
  }
  assert(emailCount === 0, "email_logs");

  let billingCount = 0;
  const billingTable = await client.query(
    `SELECT to_regclass('public.billing_email_logs') IS NOT NULL AS ok`,
  );
  if (billingTable.rows[0]?.ok) {
    billingCount = (
      await client.query(
        `SELECT count(*)::int AS c FROM billing_email_logs bel
         JOIN billing_invoices bi ON bi.id = bel.invoice_id
         WHERE bi.order_id = $1`,
        [orderId],
      )
    ).rows[0].c;
  }
  assert(billingCount === 0, "billing_email_logs");

  let invoices = 0;
  const invReg = await client.query(`SELECT to_regclass('public.billing_invoices') IS NOT NULL AS ok`);
  if (invReg.rows[0]?.ok) {
    invoices = (
      await client.query(
        `SELECT count(*)::int AS c FROM billing_invoices WHERE order_id = $1`,
        [orderId],
      )
    ).rows[0].c;
  }
  assert(invoices === 0, "billing_invoices");

  const sms = await client.query(
    `SELECT count(*)::int AS c FROM panel_sms_messages WHERE metadata->>'order_id' = $1
     OR metadata->>'sms_order_id' = $1`,
    [orderId],
  );
  assert(sms.rows[0].c === 0, "panel_sms_messages");

  const campaigns = await client.query(
    `SELECT count(*)::int AS c FROM sms_campaigns WHERE metadata->>'order_id' = $1`,
    [orderId],
  );
  assert(campaigns.rows[0].c === 0, "sms_campaigns");

  console.log(
    JSON.stringify(
      {
        ok: true,
        qa_email: qaEmail,
        order_id: orderId,
        checkout_url: checkoutUrl,
        preference_id: checkoutBody.preference_id,
        agent_checkout_endpoint: `${AGENT}/api/public/checkout`,
        legacy_endpoint_must_not_be_used:
          "https://www.telvoice.cl/api/mercadopago/create-preference",
        order: {
          payment_status: ord.payment_status,
          credit_status: ord.credit_status,
          claim_status: ord.claim_status,
          metadata: ord.metadata,
          public_checkout_reference: ord.public_checkout_reference,
        },
        side_effects: {
          wallet_transactions: 0,
          email_logs: emailCount,
          billing_email_logs: billingCount,
          billing_invoices: invoices,
          sms_messages: sms.rows[0].c,
          sms_campaigns: campaigns.rows[0].c,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
