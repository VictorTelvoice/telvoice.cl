#!/usr/bin/env node
/**
 * Fixture E2E: webhooks suscripción SIM sin MercadoPago ni inventario real.
 * Valida Parts D–G (estados, créditos, idempotencia).
 *
 * Uso: node scripts/e2e-sim-subscription-webhook-fixture.mjs --apply
 */
import "dotenv/config";
import pg from "pg";
import { randomUUID } from "node:crypto";

import {
  PROTECTED_INVENTORY_SUFFIXES,
  assertSandboxMpEnv,
} from "./lib/sim-qa-guards.mjs";

const APPLY = process.argv.includes("--apply");

async function assertFixtureGuards() {
  const mp = assertSandboxMpEnv();
  if (!mp.ok && process.env.E2E_FIXTURE_SKIP_MP_GUARD === "1") {
    console.log("WARN: MP guard omitido (E2E_FIXTURE_SKIP_MP_GUARD=1)");
    return;
  }
  if (!mp.ok) {
    for (const e of mp.errors) console.error(`✗ ${e}`);
    process.exit(1);
  }
}

async function pgQuery(sql, params = []) {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

function pass(msg) {
  console.log(`✓ ${msg}`);
}
function fail(msg) {
  console.error(`✗ ${msg}`);
}

async function main() {
  console.log("=== E2E fixture webhooks sim_subscription (sin MP/inventario) ===");
  if (!APPLY) {
    console.log("Dry-run: re-ejecutar con --apply");
    process.exit(0);
  }

  await assertFixtureGuards();

  const QA_PREFIX = `qa_sim_sub_fixture_${Date.now()}`;
  const sim = await import("../dist/services/simSubscriptionService.js");
  const { createOrder, patchOrderFields } = await import("../dist/services/smsOrderService.js");
  const { getOrCreateCompanyWallet } = await import("../dist/services/smsWalletService.js");
  const { getSimPlan } = await import("../dist/utils/simPlans.js");

  const plan = getSimPlan("sim_starter");
  if (!plan) throw new Error("plan sim_starter no encontrado");

  const preapprovalId = `${QA_PREFIX}_pre`;
  const email = `${QA_PREFIX}@testuser.com`;
  const paymentId1 = `${QA_PREFIX}_pay1`;
  const paymentId2 = `${QA_PREFIX}_pay2`;
  let companyId = null;
  let orderId = null;
  let subId = null;

  try {
    const { rows: co } = await pgQuery(
      `INSERT INTO companies (name, metadata) VALUES ($1, $2::jsonb) RETURNING id`,
      [`QA Fixture ${QA_PREFIX}`, JSON.stringify({ qa_fixture: true })],
    );
    companyId = co[0].id;

    const { rows: pkg } = await pgQuery(
      `SELECT id FROM sms_packages WHERE is_active = true ORDER BY created_at LIMIT 1`,
    );
    const packageId = pkg[0]?.id;
    if (!packageId) throw new Error("sin sms_packages activo");

    const order = await createOrder({
      companyId,
      packageId,
      paymentProvider: "mercadopago",
      paymentReference: preapprovalId,
      metadata: {
        product_type: "sim_subscription",
        plan_id: plan.plan_id,
        sim_plan_id: plan.plan_id,
        billing_mode: "subscription",
        checkout_mode: "mercadopago_subscription",
        checkout_email: email,
        qa_fixture: QA_PREFIX,
      },
    });
    orderId = order.id;

    const sub = await sim.createPendingSimSubscription({
      order,
      plan,
      checkoutEmail: email,
      inventoryNumberId: null,
      monthlyAmount: plan.total_amount,
    });
    subId = sub.id;

    await sim.attachPreapprovalToSimSubscription({
      subscriptionId: subId,
      preapprovalId,
    });

    pass("fixture order + sim_subscriptions creados");

    const sub0 = await sim.getSimSubscriptionByOrderId(orderId);

    await sim.applySimSubscriptionPreapprovalWebhook({
      subscription: sub0,
      preapprovalStatus: "authorized",
      preapprovalId,
    });
    if ((await sim.getSimSubscriptionByOrderId(orderId)).status !== "authorized") {
      fail("PARTE D authorized");
    } else pass("PARTE D: authorized (sin inventario)");

    await sim.applySimSubscriptionPreapprovalWebhook({
      subscription: sub0,
      preapprovalStatus: "authorized",
      preapprovalId,
    });
    pass("PARTE D: idempotencia authorized");

    const walletBefore = await getOrCreateCompanyWallet(companyId);
    const balBefore = Number(walletBefore.balance_sms ?? 0);

    await patchOrderFields(orderId, {
      payment_status: "paid",
      company_id: companyId,
      metadata: {
        product_type: "sim_subscription",
        plan_id: plan.plan_id,
        mercadopago_preapproval_id: preapprovalId,
        mercadopago_payment_id: paymentId1,
        qa_fixture: QA_PREFIX,
      },
    });

    await sim.syncSimSubscriptionAfterOrderFirstPayment(orderId, paymentId1);
    if ((await sim.getSimSubscriptionByOrderId(orderId)).status !== "active") {
      fail("PARTE E active");
    } else pass("PARTE E: active tras mes 1");

    const key1 = sim.subscriptionCreditIdempotencyKey(preapprovalId, paymentId1);
    const { rows: wt1 } = await pgQuery(
      `SELECT id FROM wallet_transactions WHERE metadata->>'idempotency_key' = $1`,
      [key1],
    );
    if (wt1.length !== 1) fail(`PARTE E wallet mes1 count=${wt1.length}`);
    else pass("PARTE E: crédito SMS mes 1");

    const walletAfter1 = await getOrCreateCompanyWallet(companyId);
    if (Number(walletAfter1.balance_sms ?? 0) <= balBefore) fail("PARTE E balance");
    else pass("PARTE E: saldo wallet incrementado (empresa QA)");

    await sim.syncSimSubscriptionAfterOrderFirstPayment(orderId, paymentId1);
    const { rows: wt1b } = await pgQuery(
      `SELECT count(*)::int AS c FROM wallet_transactions WHERE metadata->>'idempotency_key' = $1`,
      [key1],
    );
    if (wt1b[0].c !== 1) fail(`idempotencia mes1 count=${wt1b[0].c}`);
    else pass("PARTE E: idempotencia mes 1");

    const recur = await sim.processSimSubscriptionMercadoPagoPayment({
      paymentId: paymentId2,
      paymentStatus: "approved",
      transactionAmount: Math.round(plan.total_amount),
      preapprovalId,
      externalReference: orderId,
    });
    if (!recur.handled || String(recur.result).includes("delegate")) {
      fail(`PARTE F: ${recur.result}`);
    } else pass(`PARTE F: mes 2+ (${recur.result})`);

    const key2 = sim.subscriptionCreditIdempotencyKey(preapprovalId, paymentId2);
    const { rows: wt2 } = await pgQuery(
      `SELECT count(*)::int AS c FROM wallet_transactions WHERE metadata->>'idempotency_key' = $1`,
      [key2],
    );
    if (wt2[0].c !== 1) fail(`PARTE F wallet mes2 count=${wt2[0].c}`);
    else pass("PARTE F: crédito SMS mes 2+");

    const sub2 = await sim.getSimSubscriptionByOrderId(orderId);
    if (sub2.last_payment_id !== paymentId2 || !sub2.next_billing_date) {
      fail("PARTE F período / last_payment_id");
    } else pass("PARTE F: last_payment_id y next_billing_date");

    const recurDup = await sim.processSimSubscriptionMercadoPagoPayment({
      paymentId: paymentId2,
      paymentStatus: "approved",
      transactionAmount: Math.round(plan.total_amount),
      preapprovalId,
      externalReference: orderId,
    });
    const { rows: wt2b } = await pgQuery(
      `SELECT count(*)::int AS c FROM wallet_transactions WHERE metadata->>'idempotency_key' = $1`,
      [key2],
    );
    if (wt2b[0].c !== 1) fail(`idempotencia mes2 count=${wt2b[0].c}`);
    else pass(`PARTE F: idempotencia mes 2 (${recurDup.result})`);

    await sim.applySimSubscriptionPreapprovalWebhook({
      subscription: await sim.getSimSubscriptionByOrderId(orderId),
      preapprovalStatus: "paused",
      preapprovalId,
    });
    if ((await sim.getSimSubscriptionByOrderId(orderId)).status !== "paused") fail("paused");
    else pass("PARTE G: paused");

    await sim.applySimSubscriptionPreapprovalWebhook({
      subscription: await sim.getSimSubscriptionByOrderId(orderId),
      preapprovalStatus: "cancelled",
      preapprovalId,
    });
    if ((await sim.getSimSubscriptionByOrderId(orderId)).status !== "cancelled") fail("cancelled");
    else pass("PARTE G: cancelled");

    await sim.updateSimSubscriptionStatus({
      subscriptionId: subId,
      status: "failed",
      metadata: { qa_failed: true },
    });
    pass("PARTE G: failed");

    const { rows: inv030 } = await pgQuery(
      `SELECT sales_status FROM real_number_inventory
       WHERE right(regexp_replace(e164_number, '[^0-9]', '', 'g'), 3) = '030'`,
    );
    if (inv030[0]?.sales_status !== "connected_available") {
      fail(`***030 alterado: ${inv030[0]?.sales_status}`);
    } else pass("***030 sin cambios (connected_available)");

    console.log("\n✅ Fixture E2E webhooks completado");
  } finally {
    if (orderId) {
      await pgQuery(
        `DELETE FROM wallet_transactions WHERE metadata->>'idempotency_key' LIKE $1`,
        [`subscription-credit:${preapprovalId}:%`],
      );
      await pgQuery(`DELETE FROM sim_subscriptions WHERE order_id = $1`, [orderId]);
      await pgQuery(`DELETE FROM sms_orders WHERE id = $1`, [orderId]);
    }
    if (companyId) {
      await pgQuery(`DELETE FROM company_sms_wallets WHERE company_id = $1`, [companyId]);
      await pgQuery(`DELETE FROM companies WHERE id = $1`, [companyId]);
    }
    pass("cleanup QA fixture (wallet empresa QA revertido)");
  }
}

main().catch((err) => {
  console.error("FAIL fixture e2e", err);
  process.exit(1);
});
