#!/usr/bin/env node
/**
 * QA bolsa 200 / $1.000: products API + checkout sin pago.
 */
import "dotenv/config";
import pg from "pg";

const AGENT = process.env.QA_AGENT_URL?.trim() || "https://agent.telvoice.cl";
const PACKAGE_ID = "204786a5-0e70-43d4-8339-8403ccf810c4";
const EXPECTED_SMS = 200;
const EXPECTED_PRICE = 1000;

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const blocked = ["qa unmapped", "unmapped", "e2e", "fixture", "sandbox"];

const productsRes = await fetch(`${AGENT}/api/public/products`);
const productsBody = await productsRes.json();
assert(productsRes.ok && productsBody.success, "products API failed");

const products = productsBody.products ?? [];
const match = products.find((p) => p.package_id === PACKAGE_ID);
assert(match, "Bolsa Chile 200 SMS no visible en /api/public/products");
assert(
  String(match.product_name).toLowerCase().includes("bolsa chile 200"),
  `nombre inesperado: ${match.product_name}`,
);
assert(+match.sms_quantity === EXPECTED_SMS, "sms_quantity");
assert(+match.price_amount === EXPECTED_PRICE, "price_amount");

for (const p of products) {
  const n = String(p.product_name ?? "").toLowerCase();
  for (const b of blocked) {
    assert(!n.includes(b), `producto bloqueado visible: ${n}`);
  }
  assert(!n.includes("prueba"), `producto prueba visible: ${n}`);
}

const qaEmail = `qa.enable200+${Date.now()}@telvoice.test`;
const checkoutRes = await fetch(`${AGENT}/api/public/checkout`, {
  method: "POST",
  headers: { "content-type": "application/json", Accept: "application/json" },
  body: JSON.stringify({
    package_id: PACKAGE_ID,
    checkout_email: qaEmail,
    payer_email: qaEmail,
    payer_name: "QA Enable 200 SMS",
    source: "landing",
  }),
});
const checkoutBody = await checkoutRes.json();
assert(checkoutRes.status === 201 && checkoutBody.success, JSON.stringify(checkoutBody));

const orderId = checkoutBody.order_id;
const checkoutUrl = String(checkoutBody.checkout_url ?? "");
assert(
  checkoutUrl.includes("mercadopago") &&
    (checkoutUrl.includes("pref_id") || checkoutUrl.includes("preference")),
  "checkout_url MP",
);

const client = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});
await client.connect();
try {
  await client.query(
    `UPDATE sms_orders SET metadata = coalesce(metadata, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
    [orderId, JSON.stringify({ qa_enable_200_sms_checkout_check: true })],
  );

  const ord = (
    await client.query(
      `SELECT id, package_id, payment_status, credit_status, claim_status,
              company_id, public_checkout_reference, claim_token_hash IS NOT NULL AS has_claim_hash,
              metadata
       FROM sms_orders WHERE id = $1`,
      [orderId],
    )
  ).rows[0];

  assert(ord.package_id === PACKAGE_ID, "package_id");
  assert(ord.payment_status === "pending", "payment_status");
  assert(ord.credit_status === "pending_claim", "credit_status");
  assert(ord.claim_status === "unclaimed", "claim_status");
  assert(ord.company_id === null, "company_id");
  assert(ord.public_checkout_reference, "public_checkout_reference");
  assert(ord.has_claim_hash, "claim_token_hash");
  assert(ord.metadata?.qa_enable_200_sms_checkout_check === true, "qa metadata");

  const walletTx = await client.query(
    `SELECT count(*)::int AS c FROM wallet_transactions
     WHERE reference_type = 'sms_order' AND reference_id = $1`,
    [orderId],
  );
  assert(walletTx.rows[0].c === 0, "wallet credit antes de pago");

  console.log(
    JSON.stringify(
      {
        ok: true,
        package_id: PACKAGE_ID,
        product_name: match.product_name,
        order_id: orderId,
        checkout_url_preview: checkoutUrl.slice(0, 120),
        preference_id: checkoutBody.preference_id ?? null,
        public_checkout_reference: ord.public_checkout_reference,
        no_wallet: true,
        no_payment: true,
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
