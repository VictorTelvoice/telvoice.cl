#!/usr/bin/env node
/**
 * QA catálogo público + checkout sin pago (no SMS, no emails reales).
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

const blocked = ["qa", "unmapped", "e2e", "prueba", "fixture", "sandbox"];

const productsRes = await fetch(`${AGENT}/api/public/products`);
const productsBody = await productsRes.json();
assert(productsRes.ok && productsBody.success, "products API failed");

const names = (productsBody.products ?? []).map((p) =>
  String(p.product_name ?? "").toLowerCase(),
);
for (const n of names) {
  for (const b of blocked) {
    assert(!n.includes(b), `producto bloqueado visible: ${n}`);
  }
}
assert(!names.some((n) => n.includes("qa unmapped")), "QA Unmapped visible");

const qaEmail = `qa.catalog.visibility+${Date.now()}@telvoice.test`;
const checkoutRes = await fetch(`${AGENT}/api/public/checkout`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    package_id: PLAN_STARTER,
    checkout_email: qaEmail,
    payer_email: qaEmail,
    payer_name: "QA Catalog Visibility",
    source: "qa_catalog_visibility_check",
  }),
});
const checkoutBody = await checkoutRes.json();
assert(checkoutRes.status === 201 && checkoutBody.success, JSON.stringify(checkoutBody));

const orderId = checkoutBody.order_id;

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
    [orderId, JSON.stringify({ qa_catalog_visibility_check: true })],
  );

  const ord = (
    await client.query(
      `SELECT id, package_id, payment_status, credit_status, claim_status,
              company_id, public_checkout_reference, claim_token_hash,
              (SELECT count(*)::int FROM wallet_transactions wt
               WHERE wt.reference_type = 'sms_order' AND wt.reference_id = sms_orders.id) AS wallet_tx
       FROM sms_orders WHERE id = $1`,
      [orderId],
    )
  ).rows[0];

  assert(ord.payment_status === "pending", "payment_status");
  assert(ord.credit_status === "pending_claim", "credit_status");
  assert(ord.claim_status === "unclaimed", "claim_status");
  assert(ord.company_id === null, "company_id");
  assert(ord.package_id === PLAN_STARTER, "package_id");
  assert(ord.public_checkout_reference?.length > 3, "public_checkout_reference");
  assert(ord.claim_token_hash?.length > 10, "claim_token_hash");
  assert(ord.wallet_tx === 0, "no wallet credit");

  const emails = await client.query(
    `SELECT count(*)::int AS c FROM email_logs WHERE order_id = $1`,
    [orderId],
  );
  assert(emails.rows[0].c === 0, "no transactional email before payment");

  console.log(
    JSON.stringify(
      {
        ok: true,
        public_products_count: productsBody.products.length,
        product_names: productsBody.products.map((p) => p.product_name),
        order_id: orderId,
        order: {
          payment_status: ord.payment_status,
          credit_status: ord.credit_status,
          claim_status: ord.claim_status,
          package_id: ord.package_id,
          public_checkout_reference: ord.public_checkout_reference,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
