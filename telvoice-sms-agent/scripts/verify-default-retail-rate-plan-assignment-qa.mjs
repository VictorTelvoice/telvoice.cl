#!/usr/bin/env node
/**
 * QA — rate plan retail TELVOICE CL Retail por defecto (sin SMS).
 * npm run build && node scripts/verify-default-retail-rate-plan-assignment-qa.mjs
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RETAIL_PLAN = "5002ddd5-0732-4bf5-affd-d1e692ca39f0";
const BOLSA_PRUEBA = "204786a5-0e70-43d4-8339-8403ccf810c4";

const distPath = join(
  __dirname,
  "../dist/services/defaultRetailRatePlanService.js",
);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}
if (!existsSync(distPath)) {
  console.error("Ejecuta: npm run build");
  process.exit(1);
}

const {
  getDefaultRetailRatePlan,
  ensureDefaultRetailRatePlanForCompany,
  hasActiveRetailRatePlan,
} = await import(pathToFileURL(distPath).href);

const client = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

await client.connect();

try {
  const { config, ratePlan } = await getDefaultRetailRatePlan();
  assert(ratePlan?.id, "Rate plan default no encontrado");
  assert(
    ratePlan.id === RETAIL_PLAN || config.ratePlanId === RETAIL_PLAN,
    "ID rate plan default incorrecto",
  );
  console.log("OK 1: getDefaultRetailRatePlan → TELVOICE CL Retail");

  const companyIns = await client.query(
    `INSERT INTO companies (name, billing_email, country, status)
     VALUES ($1, $2, 'CL', 'active') RETURNING id`,
    [`QA DefaultRetail ${Date.now()}`, `qa.retail+${Date.now()}@telvoice.cl`],
  );
  const companyId = companyIns.rows[0].id;

  await client.query(
    `INSERT INTO company_sms_wallets (company_id, country, available_sms, status)
     VALUES ($1, 'CL', 0, 'active')`,
    [companyId],
  );

  const orderIns = await client.query(
    `INSERT INTO sms_orders (
       company_id, package_id, sms_quantity, amount, currency,
       payment_status, credit_status, metadata
     ) VALUES ($1, $2, 200, 1000, 'CLP', 'paid', 'credited', $3::jsonb)
     RETURNING id`,
    [
      companyId,
      BOLSA_PRUEBA,
      JSON.stringify({ source: "verify_default_retail_rate_plan_qa" }),
    ],
  );
  const orderId = orderIns.rows[0].id;

  const walletTxBefore = await client.query(
    `SELECT count(*)::int AS c FROM wallet_transactions WHERE company_id = $1`,
    [companyId],
  );

  const r1 = await ensureDefaultRetailRatePlanForCompany(companyId, {
    source: "verify_qa",
    orderId,
  });
  assert(
    r1?.status === "assigned" || r1?.status === "already_assigned",
    `status: ${r1?.status}`,
  );
  assert(r1?.rate_plan_id === RETAIL_PLAN, "rate_plan_id en resultado");

  const plans = await client.query(
    `SELECT traffic_type, live_enabled, campaigns_enabled, max_tps, rate_plan_id
     FROM company_rate_plans WHERE company_id = $1 AND status = 'active'`,
    [companyId],
  );
  assert(plans.rows.some((p) => p.traffic_type === "transactional"), "transactional");
  assert(plans.rows.some((p) => p.traffic_type === "promotional"), "promotional");
  const tx = plans.rows.find((p) => p.traffic_type === "transactional");
  assert(tx.live_enabled === true, "live_enabled");
  assert(tx.campaigns_enabled === true, "campaigns_enabled");
  assert(Number(tx.max_tps) === 2, "max_tps");
  console.log("OK 2-8: company_rate_plans asignados");

  const countPlans = plans.rows.length;
  const r2 = await ensureDefaultRetailRatePlanForCompany(companyId, {
    source: "verify_qa_repeat",
    orderId,
  });
  const plans2 = await client.query(
    `SELECT id FROM company_rate_plans WHERE company_id = $1 AND status = 'active'`,
    [companyId],
  );
  assert(plans2.rows.length === countPlans, "idempotencia: sin duplicar filas");
  assert(
    r2?.status === "assigned" ||
      r2?.status === "already_assigned" ||
      r2?.status === "skipped_already_has_active_rate_plan",
    `repetición idempotente: ${r2?.status}`,
  );
  console.log("OK 9: idempotencia");

  const companyWithPlan = await client.query(
    `INSERT INTO companies (name, billing_email, country, status)
     VALUES ($1, $2, 'CL', 'active') RETURNING id`,
    [`QA HasPlan ${Date.now()}`, `qa.hasplan+${Date.now()}@telvoice.cl`],
  );
  const co2 = companyWithPlan.rows[0].id;
  await client.query(
    `INSERT INTO company_rate_plans (
       company_id, rate_plan_id, country, traffic_type, status,
       max_tps, live_enabled, campaigns_enabled, api_enabled
     ) VALUES ($1, $2, 'CL', 'transactional', 'active', 1, true, false, false)`,
    [co2, RETAIL_PLAN],
  );
  assert(await hasActiveRetailRatePlan(co2), "hasActiveRetailRatePlan");
  const rSkip = await ensureDefaultRetailRatePlanForCompany(co2, {
    source: "verify_qa_skip",
  });
  assert(
    rSkip?.status === "upgraded_existing_rate_plan" ||
      rSkip?.status === "skipped_already_has_active_rate_plan",
    `debe upgrade o skip si ya tiene plan: ${rSkip?.status}`,
  );
  const co2Plans = await client.query(
    `SELECT campaigns_enabled, max_tps FROM company_rate_plans
     WHERE company_id = $1 AND traffic_type = 'transactional' AND status = 'active'`,
    [co2],
  );
  assert(co2Plans.rows[0]?.campaigns_enabled === true, "upgrade campaigns_enabled");
  console.log("OK 10: no duplica; upgrade flags retail si faltaban");

  const walletTxAfter = await client.query(
    `SELECT count(*)::int AS c FROM wallet_transactions WHERE company_id = $1`,
    [companyId],
  );
  assert(walletTxBefore.rows[0].c === walletTxAfter.rows[0].c, "sin wallet tx extra");

  const panel = await client.query(
    `SELECT count(*)::int AS c FROM panel_sms_messages WHERE company_id = $1`,
    [companyId],
  );
  assert(panel.rows[0].c === 0, "sin SMS");

  const meta = await client.query(
    `SELECT metadata FROM sms_orders WHERE id = $1`,
    [orderId],
  );
  assert(
    meta.rows[0].metadata?.rate_plan_assignment_status === "assigned" ||
      meta.rows[0].metadata?.rate_plan_assignment_status === "already_assigned",
    "metadata orden actualizada",
  );
  console.log("OK 11-15: sin SMS, metadata, sin campañas");

  const distAuth = join(
    __dirname,
    "../dist/services/commercialSmsAuthorizationService.js",
  );
  if (existsSync(distAuth)) {
    const { isCompanyAuthorizedForPanelSmsSend, isCompanyInLiveTestAllowlist } =
      await import(pathToFileURL(distAuth).href);
    const panelOk = await isCompanyAuthorizedForPanelSmsSend(companyId);
    assert(panelOk, "nueva company autorizada para panel sin allowlist manual");
    assert(
      !isCompanyInLiveTestAllowlist(companyId) ||
        process.env.SMS_LIVE_TEST_ALLOWED_COMPANY_IDS?.includes(companyId),
      "allowlist check",
    );
    console.log("OK 16: autorización panel por rate plan (sin depender de .env por cliente)");
  }

  console.log("\n✅ verify-default-retail-rate-plan-assignment-qa OK");
  console.log(`   company_id: ${companyId}`);
  console.log(`   order_id: ${orderId}`);
} finally {
  await client.end();
}
