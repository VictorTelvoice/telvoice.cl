#!/usr/bin/env node
/**
 * Auditoría onboarding primer cliente real (runbook go-live-cliente-real.md).
 *
 * Uso:
 *   node scripts/client-onboarding-audit.mjs --email=user@domain.com
 *   node scripts/client-onboarding-audit.mjs --order-id=uuid
 *   node scripts/client-onboarding-audit.mjs --company-id=uuid
 *   node scripts/client-onboarding-audit.mjs --enable-campaigns --max-tps=1
 */
import "dotenv/config";
import pg from "pg";

const RETAIL_PLAN = "5002ddd5-0732-4bf5-affd-d1e692ca39f0";

function arg(name) {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : null;
}

const email = arg("email")?.toLowerCase().trim();
const orderId = arg("order-id");
const companyId = arg("company-id");
const enableCampaigns = process.argv.includes("--enable-campaigns");
const maxTps = Number(arg("max-tps") ?? "1");

if (!email && !orderId && !companyId) {
  console.error(
    "Indica --email=, --order-id= o --company-id= del cliente real.",
  );
  process.exit(2);
}

const cs = process.env.DATABASE_URL;
const c = new pg.Client({
  connectionString: cs,
  ssl: cs?.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});
await c.connect();

let order = null;
let company = null;

if (orderId) {
  const { rows } = await c.query(
    `SELECT o.*, p.name AS package_name FROM sms_orders o
     LEFT JOIN sms_packages p ON p.id = o.package_id WHERE o.id = $1`,
    [orderId],
  );
  order = rows[0] ?? null;
  if (order?.company_id) {
    company = (
      await c.query(`SELECT * FROM companies WHERE id = $1`, [order.company_id])
    ).rows[0];
  }
}

if (email && !order) {
  const { rows } = await c.query(
    `SELECT o.*, p.name AS package_name FROM sms_orders o
     LEFT JOIN sms_packages p ON p.id = o.package_id
     WHERE lower(coalesce(o.checkout_email, '')) = $1
        OR lower(coalesce(o.payer_email, '')) = $1
     ORDER BY o.created_at DESC LIMIT 1`,
    [email],
  );
  order = rows[0] ?? null;
}

if (companyId) {
  company = (
    await c.query(`SELECT * FROM companies WHERE id = $1`, [companyId])
  ).rows[0];
  if (!order) {
    const { rows } = await c.query(
      `SELECT o.*, p.name AS package_name FROM sms_orders o
       LEFT JOIN sms_packages p ON p.id = o.package_id
       WHERE o.company_id = $1 ORDER BY o.created_at DESC LIMIT 1`,
      [companyId],
    );
    order = rows[0] ?? null;
  }
}

if (email && !company) {
  const { rows } = await c.query(
    `SELECT * FROM companies
     WHERE lower(coalesce(billing_email, '')) = $1
     ORDER BY created_at DESC LIMIT 1`,
    [email],
  );
  company = rows[0] ?? null;
}

const resolvedCompanyId = company?.id ?? order?.company_id ?? null;

const wallet = resolvedCompanyId
  ? (
      await c.query(
        `SELECT * FROM company_sms_wallets WHERE company_id = $1 LIMIT 1`,
        [resolvedCompanyId],
      )
    ).rows[0]
  : null;

const crp = resolvedCompanyId
  ? (
      await c.query(
        `SELECT crp.*, srp.name AS rate_plan_name, srp.code
         FROM company_rate_plans crp
         LEFT JOIN sms_rate_plans srp ON srp.id = crp.rate_plan_id
         WHERE crp.company_id = $1 AND crp.country = 'CL'`,
        [resolvedCompanyId],
      )
    ).rows
  : [];

const purchaseCredits = resolvedCompanyId
  ? (
      await c.query(
        `SELECT id, sms_amount, type, reference_type, reference_id, created_at
         FROM wallet_transactions
         WHERE company_id = $1 AND type = 'purchase_credit'
         ORDER BY created_at`,
        [resolvedCompanyId],
      )
    ).rows
  : [];

const campaigns = resolvedCompanyId
  ? (
      await c.query(
        `SELECT id, name, status, mode, created_at FROM sms_campaigns
         WHERE company_id = $1 ORDER BY created_at DESC LIMIT 5`,
        [resolvedCompanyId],
      )
    ).rows
  : [];

const route = (
  await c.query(
    `SELECT r.name, r.status, p.code, p.status AS provider_status
     FROM sms_routes r JOIN sms_providers p ON p.id = r.provider_id
     WHERE r.name ILIKE '%Chile Default%' LIMIT 1`,
  )
).rows[0];

if (enableCampaigns && resolvedCompanyId) {
  await c.query(
    `UPDATE company_rate_plans
     SET campaigns_enabled = true, api_enabled = false, live_enabled = true,
         max_tps = $2, status = 'active'
     WHERE company_id = $1 AND country = 'CL' AND status = 'active'`,
    [resolvedCompanyId, maxTps],
  );
}

const crpAfter = resolvedCompanyId
  ? (
      await c.query(
        `SELECT traffic_type, campaigns_enabled, api_enabled, max_tps, live_enabled, rate_plan_id
         FROM company_rate_plans WHERE company_id = $1 AND country = 'CL'`,
        [resolvedCompanyId],
      )
    ).rows
  : [];

const postPago = order
  ? {
      payment_status: order.payment_status,
      credit_status: order.credit_status,
      claim_status: order.claim_status,
      ok_paid: order.payment_status === "paid",
      ok_pending_claim:
        order.credit_status === "pending_claim" || order.credit_status === "credited",
      ok_unclaimed_before_claim: order.claim_status === "unclaimed",
      ok_no_wallet_before_claim:
        order.claim_status === "unclaimed"
          ? purchaseCredits.length === 0 && !wallet?.available_sms
          : null,
    }
  : null;

const postClaim = resolvedCompanyId
  ? {
      company_exists: Boolean(company),
      wallet_exists: Boolean(wallet),
      purchase_credit_count: purchaseCredits.length,
      wallet_balance: wallet?.available_sms ?? null,
      retail_plan_assigned: crpAfter.some((r) => r.rate_plan_id === RETAIL_PLAN),
      campaigns_enabled: crpAfter.some((r) => r.campaigns_enabled),
    }
  : null;

const report = {
  lookup: { email, orderId, companyId },
  found: {
    order_id: order?.id ?? null,
    company_id: resolvedCompanyId,
    company_name: company?.name ?? null,
    billing_email: company?.billing_email ?? order?.checkout_email ?? null,
    package_name: order?.package_name ?? null,
    sms_quantity_ordered: order?.sms_quantity ?? null,
    wallet_id: wallet?.id ?? null,
  },
  post_pago: postPago,
  post_claim: postClaim,
  rate_plans: crpAfter,
  route,
  existing_campaigns: campaigns,
  campaigns_enabled_applied: enableCampaigns,
  deliverable_template: {
    order_id: order?.id ?? "",
    company_id: resolvedCompanyId ?? "",
    wallet_id: wallet?.id ?? "",
    saldo_inicial: wallet?.available_sms ?? order?.sms_quantity ?? "",
    rate_plan: "TELVOICE CL Retail",
    campaigns_enabled: crpAfter.some((r) => r.campaigns_enabled) ? "true" : "false",
    campaign_id: "",
    destinatarios_validos: "",
    segmentos_por_mensaje: "1 (objetivo GSM-7)",
    costo_estimado: "",
    enviados: "",
    delivered: "",
    failed: "",
    saldo_antes: "",
    saldo_despues: "",
    debitos_wallet: "",
    errores: "",
    recomendacion: "",
  },
  next_steps: [],
};

if (!order && !company) {
  report.next_steps.push("No se encontró orden ni empresa — confirmar email/order_id con Victor.");
} else if (order?.claim_status === "unclaimed" && order?.credit_status === "pending_claim") {
  report.next_steps.push("Cliente debe completar claim con Google (mismo email checkout).");
} else if (postClaim && !postClaim.retail_plan_assigned) {
  report.next_steps.push("Asignar TELVOICE CL Retail (ensureDefaultRetailRatePlan).");
} else if (postClaim && !postClaim.campaigns_enabled && !enableCampaigns) {
  report.next_steps.push(
    "Ejecutar con --enable-campaigns cuando Victor autorice.",
  );
} else if (postClaim?.campaigns_enabled) {
  report.next_steps.push(
    "Cargar 10-50 contactos en panel, preview con mensaje GSM-7, lanzar tras confirmación Victor.",
  );
}

console.log(JSON.stringify(report, null, 2));
await c.end();
