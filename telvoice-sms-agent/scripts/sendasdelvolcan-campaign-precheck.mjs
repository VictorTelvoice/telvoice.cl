#!/usr/bin/env node
/**
 * Pre-check campaña CSV Victor Garces (sin envío).
 * node scripts/sendasdelvolcan-campaign-precheck.mjs
 */
import "dotenv/config";
import pg from "pg";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";

const COMPANY_ID = "8d95a776-8527-41bc-8fa1-387b756733a5";
const ORDER_ID = "31fb5b51-8856-4a24-b55b-7e2ddd648f10";
const RETAIL_PLAN = "5002ddd5-0732-4bf5-affd-d1e692ca39f0";

const ROWS = [
  { phone: "56934449937", message: "tu prueba es 1" },
  { phone: "56974713166", message: "tu prueba es 2" },
  { phone: "56977109623", message: "tu prueba es 3" },
];

function parseCsv(v) {
  return String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const distSeg = join(__dirname, "../dist/services/smsSegmentService.js");
const distPolicy = join(__dirname, "../dist/services/smsCampaignPolicy.js");
const distReadiness = join(
  __dirname,
  "../dist/services/campaignReadinessService.js",
);

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const c = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});
await c.connect();

const company = (
  await c.query("SELECT id, name, status, billing_email FROM companies WHERE id = $1", [
    COMPANY_ID,
  ])
).rows[0];

const wallet = (
  await c.query(
    "SELECT id, available_sms, status FROM company_sms_wallets WHERE company_id = $1",
    [COMPANY_ID],
  )
).rows[0];

const order = (
  await c.query(
    `SELECT id, payment_status, credit_status, claim_status, metadata->>'mercadopago_payment_id' AS mp_payment
     FROM sms_orders WHERE id = $1`,
    [ORDER_ID],
  )
).rows[0];

const users = (
  await c.query(
    `SELECT cu.user_id, cu.role, cu.created_at
     FROM company_users cu
     WHERE cu.company_id = $1`,
    [COMPANY_ID],
  )
).rows;

const ratePlans = (
  await c.query(
    `SELECT id, traffic_type, live_enabled, campaigns_enabled, api_enabled, max_tps, rate_plan_id, status
     FROM company_rate_plans WHERE company_id = $1 ORDER BY traffic_type`,
    [COMPANY_ID],
  )
).rows;

const senders = { note: "sender desde panel / metadata empresa" };

const allowedCompanies = parseCsv(process.env.SMS_LIVE_TEST_ALLOWED_COMPANY_IDS);
const inAllowlist = allowedCompanies.includes(COMPANY_ID);

let segmentPreview = [];
if (existsSync(distSeg)) {
  const seg = await import(pathToFileURL(distSeg).href);
  segmentPreview = ROWS.map((r) => {
    const info = seg.calculateSmsSegments(r.message);
    return {
      phone: r.phone,
      message: r.message,
      segments: info.segments,
      encoding: info.encoding,
    };
  });
}

let policyOk = null;
if (existsSync(distPolicy)) {
  const pol = await import(pathToFileURL(distPolicy).href);
  try {
    for (const r of ROWS) {
      pol.assertCampaignRecipientAllowed({
        companyId: COMPANY_ID,
        to: r.phone,
      });
    }
    policyOk = true;
  } catch (e) {
    policyOk = String(e?.message ?? e);
  }
}

const totalSegments = segmentPreview.reduce((s, r) => s + (r.segments || 1), 0);
const balance = Number(wallet?.available_sms ?? 0);

const blockers = [];
if (!company) blockers.push("company_not_found");
if (company?.status !== "active") blockers.push(`company_status_${company?.status}`);
if (!inAllowlist) blockers.push("company_not_in_SMS_LIVE_TEST_ALLOWED_COMPANY_IDS");
const promo = ratePlans.find((r) => r.traffic_type === "promotional" && r.status === "active");
const tx = ratePlans.find((r) => r.traffic_type === "transactional" && r.status === "active");
if (!promo?.campaigns_enabled && !tx?.campaigns_enabled)
  blockers.push("campaigns_enabled_false");
if (!tx?.live_enabled && !promo?.live_enabled) blockers.push("live_enabled_false");
if (policyOk !== true) blockers.push(`policy: ${policyOk}`);

console.log(
  JSON.stringify(
    {
      company_id: COMPANY_ID,
      company_name: company?.name,
      billing_email: company?.billing_email,
      user_ids: users,
      wallet_id: wallet?.id,
      wallet_balance: balance,
      order,
      rate_plans: ratePlans,
      senders,
      env: {
        in_allowlist: inAllowlist,
        skip_number_whitelist:
          process.env.SMS_CAMPAIGN_SKIP_NUMBER_WHITELIST === "true",
        campaign_enabled: process.env.SMS_CAMPAIGN_ENABLED === "true",
        live_test_enabled: process.env.SMS_LIVE_TEST_ENABLED === "true",
      },
      campaign_csv_preview: {
        recipients: ROWS.length,
        valid: ROWS.length,
        invalid: 0,
        segments_total: totalSegments,
        balance_before: balance,
        balance_after_estimated: balance - totalSegments,
        per_row: segmentPreview,
        suggested_sender: "VICTORGARCE",
      },
      blockers,
      ready_for_launch: blockers.length === 0,
      note: "No se envió SMS. Esperar: confirmo lanzar campaña",
    },
    null,
    2,
  ),
);

await c.end();
