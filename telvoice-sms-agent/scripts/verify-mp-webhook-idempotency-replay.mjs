#!/usr/bin/env node
/**
 * QA idempotencia: replay del mismo pago SIM no debe duplicar crédito/email/activación.
 * Usa orden ya pagada (Chucao) — solo lectura de estado + apply idempotente.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import pg from "pg";

const ORDER_ID = "abcb7845-14c4-4535-8011-3aece9749de2";
const PAYMENT_ID = "165517293751";
const PREAPPROVAL_ID = "2b552b539c684b7eb0117bde56462e9e";
const EMAIL = "info@larutadelchucao.cl";

if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

const { applySimSubscriptionApprovedPayment } = await import(
  "../dist/services/simSubscriptionPaymentActivationService.js"
);
const { processSimSubscriptionMercadoPagoPayment } = await import(
  "../dist/services/simSubscriptionService.js"
);

async function snapshot() {
  const cs = process.env.DATABASE_URL.trim();
  const c = new pg.Client({
    connectionString: cs,
    ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined },
  );
  await c.connect();
  const r = await c.query(
    `
    SELECT
      (SELECT count(*)::int FROM wallet_transactions wt
       JOIN company_sms_wallets w ON w.id = wt.wallet_id
       JOIN sms_orders o ON o.company_id = w.company_id
       WHERE o.id = $1 AND wt.type = 'purchase_credit'
         AND wt.description ILIKE '%suscripción numeración SIM%') AS sim_credits,
      (SELECT count(*)::int FROM email_logs WHERE order_id = $1) AS emails,
      (SELECT count(*)::int FROM client_numbers cn
       JOIN sms_orders o ON o.company_id = cn.company_id
       WHERE o.id = $1 AND cn.number = '+56981272867') AS client_numbers,
      (SELECT activation_status FROM sim_activation_requests WHERE order_id = $1) AS activation
    `,
    [ORDER_ID],
  );
  await c.end();
  return r.rows[0];
}

const before = await snapshot();

const first = await applySimSubscriptionApprovedPayment({
  orderId: ORDER_ID,
  paymentId: PAYMENT_ID,
  paymentStatus: "approved",
  transactionAmount: 29994,
  preapprovalId: PREAPPROVAL_ID,
  source: "idempotency_replay_test_1",
});

const second = await applySimSubscriptionApprovedPayment({
  orderId: ORDER_ID,
  paymentId: PAYMENT_ID,
  paymentStatus: "approved",
  transactionAmount: 29994,
  preapprovalId: PREAPPROVAL_ID,
  source: "idempotency_replay_test_2",
});

assert.equal(first.ok, true, "first replay ok");
assert.equal(first.result, "already_active", "first replay already_active");
assert.equal(second.ok, true, "second replay ok");
assert.equal(second.result, "already_active", "second replay already_active");

const recurring1 = await processSimSubscriptionMercadoPagoPayment({
  paymentId: PAYMENT_ID,
  paymentStatus: "approved",
  transactionAmount: 29994,
  preapprovalId: PREAPPROVAL_ID,
  externalReference: ORDER_ID,
});

const recurring2 = await processSimSubscriptionMercadoPagoPayment({
  paymentId: PAYMENT_ID,
  paymentStatus: "approved",
  transactionAmount: 29994,
  preapprovalId: PREAPPROVAL_ID,
  externalReference: ORDER_ID,
});

assert.equal(recurring1.handled, true);
assert.equal(
  recurring1.result,
  "recurring_credit_already_processed",
  "recurring replay idempotent",
);
assert.equal(recurring2.handled, true);
assert.equal(recurring2.result, "recurring_credit_already_processed");

const after = await snapshot();

assert.equal(Number(before.sim_credits), Number(after.sim_credits), "sin doble crédito SMS");
assert.equal(Number(before.emails), Number(after.emails), "sin doble email");
assert.equal(Number(before.client_numbers), Number(after.client_numbers), "sin duplicar client_numbers");
assert.equal(before.activation, after.activation, "sin cambio activación");

console.log(
  JSON.stringify(
    {
      ok: true,
      order_id: ORDER_ID,
      email: EMAIL,
      replay_results: { first: first.result, second: second.result, recurring: recurring2.result },
      counts_unchanged: {
        sim_credits: after.sim_credits,
        emails: after.emails,
        client_numbers: after.client_numbers,
      },
    },
    null,
    2,
  ),
);
