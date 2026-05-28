#!/usr/bin/env node
/**
 * QA post-deploy: checkout público + claim simulado + Licantravel (sin pago real, sin SMS).
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "dotenv/config";
import pg from "pg";

const BOLSA_PRUEBA = "204786a5-0e70-43d4-8339-8403ccf810c4";
const RETAIL_PLAN = "5002ddd5-0732-4bf5-affd-d1e692ca39f0";
const LICANTRAVEL = "54601663-f35f-4c26-9410-a9d2dc0ad697";
const LICANTRAVEL_WALLET = "6d873673-947b-4657-96f0-031d14db45fd";
const AGENT = process.env.QA_AGENT_URL?.trim() || "https://agent.telvoice.cl";

const __dirname = dirname(fileURLToPath(import.meta.url));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

const distOrder = join(__dirname, "../dist/services/smsOrderService.js");
const distRetail = join(__dirname, "../dist/services/defaultRetailRatePlanService.js");
if (!existsSync(distOrder) || !existsSync(distRetail)) {
  console.error("npm run build primero");
  process.exit(1);
}

const { confirmOrderCredit } = await import(pathToFileURL(distOrder).href);
const {
  ensureDefaultRetailRatePlanForCompany,
  getDefaultRetailRatePlan,
} = await import(pathToFileURL(distRetail).href);

const client = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

const report = {
  checkout: {},
  claimSim: {},
  licantravel: {},
  runtime: {},
};

await client.connect();

try {
  const health = await fetch(`${AGENT}/health`);
  const healthJson = await health.json();
  assert(healthJson.status === "ok", "health no ok");
  report.health = healthJson;

  const qaEmail = `qa.postdeploy+${Date.now()}@telvoice.test`;
  const checkoutRes = await fetch(`${AGENT}/api/public/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      package_id: BOLSA_PRUEBA,
      checkout_email: qaEmail,
      payer_email: qaEmail,
      payer_name: "QA Post Deploy",
    }),
  });
  const checkoutBody = await checkoutRes.json();
  assert(checkoutRes.status === 201 && checkoutBody.success, JSON.stringify(checkoutBody));
  const orderId = checkoutBody.order_id;
  report.checkout = {
    order_id: orderId,
    public_checkout_reference: checkoutBody.public_checkout_reference,
    preference_id: checkoutBody.preference_id,
    has_checkout_url: Boolean(checkoutBody.checkout_url),
    has_claim_token: Boolean(checkoutBody.claim_token),
  };

  const ord = (
    await client.query(
      `SELECT id, company_id, package_id, payment_status, credit_status, claim_status,
              claim_token_hash, public_checkout_reference, checkout_email
       FROM sms_orders WHERE id = $1`,
      [orderId],
    )
  ).rows[0];

  assert(ord.payment_status === "pending", `payment_status=${ord.payment_status}`);
  assert(ord.credit_status === "pending_claim", `credit_status=${ord.credit_status}`);
  assert(ord.claim_status === "unclaimed", `claim_status=${ord.claim_status}`);
  assert(ord.company_id === null, "company_id debe ser null");
  assert(ord.package_id === BOLSA_PRUEBA, "package_id");
  assert(ord.claim_token_hash?.length > 10, "claim_token_hash");
  assert(ord.public_checkout_reference?.length > 3, "public_checkout_reference");
  report.checkout.db = ord;

  const companyIns = await client.query(
    `INSERT INTO companies (name, billing_email, country, status)
     VALUES ($1, $2, 'CL', 'active') RETURNING id`,
    [`QA PostDeploy Claim ${Date.now()}`, qaEmail],
  );
  const companyId = companyIns.rows[0].id;
  await client.query(
    `INSERT INTO company_sms_wallets (company_id, country, available_sms, status)
     VALUES ($1, 'CL', 0, 'active')`,
    [companyId],
  );

  await client.query(
    `UPDATE sms_orders SET payment_status = 'paid', company_id = $1,
            claim_status = 'claimed', credit_status = 'pending', claimed_at = now()
     WHERE id = $2`,
    [companyId, orderId],
  );

  const plansBefore = (
    await client.query(
      `SELECT count(*)::int AS c FROM company_rate_plans WHERE company_id = $1 AND status = 'active'`,
      [companyId],
    )
  ).rows[0].c;
  assert(plansBefore === 0, "company nueva no debe tener rate plan previo");

  const credit1 = await confirmOrderCredit(orderId, null, {
    allowManualWithoutPaid: false,
    ratePlanSource: "public_checkout_claim",
  });
  assert(credit1.order.credit_status === "credited", "credit_status");

  const walletTx = await client.query(
    `SELECT count(*)::int AS c, sum(sms_amount)::int AS sms FROM wallet_transactions
     WHERE company_id = $1 AND reference_type = 'sms_order' AND reference_id = $2 AND type = 'purchase_credit'`,
    [companyId, orderId],
  );
  assert(walletTx.rows[0].c === 1, "wallet credit único");

  const rp = await ensureDefaultRetailRatePlanForCompany(companyId, {
    source: "public_checkout_claim",
    orderId,
  });
  const plans = await client.query(
    `SELECT id, traffic_type, live_enabled, campaigns_enabled, api_enabled, max_tps, rate_plan_id
     FROM company_rate_plans WHERE company_id = $1 AND status = 'active' ORDER BY traffic_type`,
    [companyId],
  );

  const meta = (
    await client.query(`SELECT metadata FROM sms_orders WHERE id = $1`, [orderId])
  ).rows[0].metadata;

  assert(plans.rows.some((p) => p.traffic_type === "transactional"), "transactional");
  assert(plans.rows.some((p) => p.traffic_type === "promotional"), "promotional");
  const tx = plans.rows.find((p) => p.traffic_type === "transactional");
  assert(tx.live_enabled === true, "live_enabled");
  assert(tx.campaigns_enabled === false, "campaigns_enabled");
  assert(tx.api_enabled === false, "api_enabled");
  assert(Number(tx.max_tps) === 1, "max_tps");
  assert(tx.rate_plan_id === RETAIL_PLAN, "rate_plan_id");
  assert(
    meta.rate_plan_assignment_status === "assigned" ||
      meta.rate_plan_assignment_status === "already_assigned",
    `assignment status: ${meta.rate_plan_assignment_status}`,
  );

  const credit2 = await confirmOrderCredit(orderId, null, {
    ratePlanSource: "public_checkout_claim",
  });
  assert(credit2.alreadyCredited, "segundo credit idempotente");
  const plans2 = await client.query(
    `SELECT count(*)::int AS c FROM company_rate_plans WHERE company_id = $1 AND status = 'active'`,
    [companyId],
  );
  assert(plans2.rows[0].c === plans.rows.length, "sin duplicar rate plans");

  const panel = await client.query(
    `SELECT count(*)::int AS c FROM panel_sms_messages WHERE company_id = $1`,
    [companyId],
  );
  const campaigns = await client.query(
    `SELECT count(*)::int AS c FROM sms_campaigns WHERE company_id = $1`,
    [companyId],
  );
  assert(panel.rows[0].c === 0, "sin SMS");
  assert(campaigns.rows[0].c === 0, "sin campañas");

  report.claimSim = {
    company_id: companyId,
    wallet_credit_count: walletTx.rows[0].c,
    wallet_credit_sms: walletTx.rows[0].sms,
    rate_plan_assignment: rp,
    company_rate_plans: plans.rows,
    order_metadata_rate_plan: {
      status: meta.rate_plan_assignment_status,
      rate_plan_id: meta.rate_plan_id,
    },
    panel_sms_messages: panel.rows[0].c,
    sms_campaigns: campaigns.rows[0].c,
  };

  const ltPlansBefore = (
    await client.query(
      `SELECT id, traffic_type, live_enabled, campaigns_enabled, api_enabled, max_tps, rate_plan_id, created_at
       FROM company_rate_plans WHERE company_id = $1 AND status = 'active' ORDER BY traffic_type`,
      [LICANTRAVEL],
    )
  ).rows;
  const ltPlansCountBefore = ltPlansBefore.length;

  const ltWallet = (
    await client.query(
      `SELECT available_sms FROM company_sms_wallets WHERE id = $1`,
      [LICANTRAVEL_WALLET],
    )
  ).rows[0];

  const ltPanelBefore = (
    await client.query(
      `SELECT count(*)::int AS c FROM panel_sms_messages WHERE company_id = $1`,
      [LICANTRAVEL],
    )
  ).rows[0].c;
  const ltDebitBefore = (
    await client.query(
      `SELECT count(*)::int AS c FROM wallet_transactions WHERE company_id = $1 AND type = 'sms_debit'`,
      [LICANTRAVEL],
    )
  ).rows[0].c;

  const ltEnsure = await ensureDefaultRetailRatePlanForCompany(LICANTRAVEL, {
    source: "qa_licantravel_skip_check",
  });

  const ltPlansAfter = (
    await client.query(
      `SELECT id, traffic_type, live_enabled, campaigns_enabled, api_enabled, max_tps, rate_plan_id
       FROM company_rate_plans WHERE company_id = $1 AND status = 'active' ORDER BY traffic_type`,
      [LICANTRAVEL],
    )
  ).rows;

  assert(ltPlansAfter.length === ltPlansCountBefore, "Licantravel: sin duplicar rate plans");
  assert(
    ltEnsure?.status === "skipped_already_has_active_rate_plan" ||
      ltEnsure?.status === "already_assigned",
    `Licantravel ensure: ${ltEnsure?.status}`,
  );

  const txLt = ltPlansAfter.find((p) => p.traffic_type === "transactional");
  assert(txLt?.rate_plan_id === RETAIL_PLAN, "Licantravel retail plan");
  assert(txLt?.live_enabled === true, "Licantravel live_enabled");
  assert(txLt?.campaigns_enabled === false, "Licantravel campaigns_enabled");
  assert(Number(txLt?.max_tps) === 1, "Licantravel max_tps");

  const { ratePlan } = await getDefaultRetailRatePlan();
  const distRoute = join(__dirname, "../dist/services/smsRoutingService.js");
  const { resolveRouteForMessage } = await import(pathToFileURL(distRoute).href);
  const route = await resolveRouteForMessage({
    companyId: LICANTRAVEL,
    country: "CL",
    trafficType: "transactional",
  });

  const ltWalletAfter = (
    await client.query(
      `SELECT available_sms FROM company_sms_wallets WHERE id = $1`,
      [LICANTRAVEL_WALLET],
    )
  ).rows[0];
  const ltPanelAfter = (
    await client.query(
      `SELECT count(*)::int AS c FROM panel_sms_messages WHERE company_id = $1`,
      [LICANTRAVEL],
    )
  ).rows[0].c;
  const ltDebitAfter = (
    await client.query(
      `SELECT count(*)::int AS c FROM wallet_transactions WHERE company_id = $1 AND type = 'sms_debit'`,
      [LICANTRAVEL],
    )
  ).rows[0].c;

  assert(ltWalletAfter.available_sms === 200, `saldo=${ltWalletAfter.available_sms}`);
  assert(ltPanelAfter === ltPanelBefore, "sin nuevos panel messages");
  assert(ltDebitAfter === ltDebitBefore, "sin nuevos sms_debit");

  report.licantravel = {
    company_id: LICANTRAVEL,
    wallet_sms: ltWalletAfter.available_sms,
    rate_plans: ltPlansAfter,
    ensure_result: ltEnsure,
    route: {
      route_name: route.route.name,
      route_status: route.route.status,
      provider_name: route.provider.name,
      provider_status: route.provider.status,
      default_sender_id: route.provider.default_sender_id,
    },
    suggested_sender_id: "LICANTRAVEL",
    panel_sms_messages: ltPanelAfter,
    sms_debit_count: ltDebitAfter,
  };

  console.log(JSON.stringify(report, null, 2));
  console.log("\n✅ verify-post-deploy-retail-rate-plan-qa completado");
} catch (e) {
  console.error("FAIL:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
