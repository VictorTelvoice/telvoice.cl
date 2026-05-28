/**
 * Pre-check read-only: campaña controlada Licantravel (sin envío).
 * Uso VPS: node scripts/licantravel-campaign-precheck.mjs
 */
import "dotenv/config";
import pg from "pg";

const COMPANY_ID = "54601663-f35f-4c26-9410-a9d2dc0ad697";
const WALLET_ID = "6d873673-947b-4657-96f0-031d14db45fd";
const EXPECTED_RATE_PLAN = "5002ddd5-0732-4bf5-affd-d1e692ca39f0";

function parseCsv(v) {
  return String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function maskPhone(p) {
  const d = String(p).replace(/[^\d+]/g, "");
  if (d.length < 6) return "***";
  return d.slice(0, 4) + "****" + d.slice(-3);
}

const cs = process.env.DATABASE_URL?.trim();
if (!cs) {
  console.error("missing DATABASE_URL");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});
await client.connect();

const company = (
  await client.query("SELECT id, name, status FROM companies WHERE id = $1", [
    COMPANY_ID,
  ])
).rows[0];

const wallet = (
  await client.query(
    "SELECT id, company_id, available_sms, status, updated_at FROM company_sms_wallets WHERE id = $1",
    [WALLET_ID],
  )
).rows[0];

const ratePlans = (
  await client.query(
    `SELECT crp.id, crp.country, crp.traffic_type, crp.status, crp.live_enabled,
            crp.campaigns_enabled, crp.api_enabled, crp.max_tps, crp.rate_plan_id,
            srp.name AS rate_plan_name, srp.code AS rate_plan_code
     FROM company_rate_plans crp
     LEFT JOIN sms_rate_plans srp ON srp.id = crp.rate_plan_id
     WHERE crp.company_id = $1
     ORDER BY crp.country, crp.traffic_type`,
    [COMPANY_ID],
  )
).rows;

const campaigns = (
  await client.query(
    `SELECT id, name, status, mode, sender_id, created_at, sent_at, metadata
     FROM sms_campaigns WHERE company_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [COMPANY_ID],
  )
).rows;

const queueLican = (
  await client.query(
    `SELECT status, count(*)::int AS c FROM sms_send_queue
     WHERE company_id = $1 GROUP BY status`,
    [COMPANY_ID],
  )
).rows;

const queueGlobal = (
  await client.query(
    `SELECT status, count(*)::int AS c FROM sms_send_queue
     WHERE status IN ('pending', 'queued', 'processing') GROUP BY status`,
  )
).rows;

const messages = (
  await client.query(
    `SELECT * FROM panel_sms_messages WHERE company_id = $1
     ORDER BY created_at DESC LIMIT 5`,
    [COMPANY_ID],
  )
).rows.map((row) => ({
  id: row.id,
  status: row.status,
  recipient:
    row.to_number ?? row.recipient_phone ?? row.phone ?? row.destination ?? null,
  sender_id: row.sender_id,
  provider: row.provider,
  provider_message_id: row.provider_message_id,
  mode: row.mode,
  campaign_id: row.campaign_id,
  created_at: row.created_at,
}));

const routes = (
  await client.query(
    `SELECT r.id, r.name, r.status, r.country, r.traffic_type,
            p.code AS provider_code, p.name AS provider_name, p.status AS provider_status,
            p.default_sender_id
     FROM sms_routes r
     JOIN sms_providers p ON p.id = r.provider_id
     WHERE r.country = 'CL'
     ORDER BY r.priority ASC NULLS LAST, r.created_at ASC
     LIMIT 12`,
  )
).rows;

let schedulerRow = null;
try {
  schedulerRow = (
    await client.query(
      `SELECT key, value, updated_at FROM platform_runtime_settings WHERE key = 'sms_queue_scheduler'`,
    )
  ).rows[0];
} catch {
  schedulerRow = null;
}

const promo = ratePlans.find(
  (r) =>
    r.status === "active" &&
    String(r.country).toUpperCase() === "CL" &&
    String(r.traffic_type).toLowerCase() === "promotional",
);
const tx = ratePlans.find(
  (r) =>
    r.status === "active" &&
    String(r.country).toUpperCase() === "CL" &&
    String(r.traffic_type).toLowerCase() === "transactional",
);

const allowedCompanies = parseCsv(process.env.SMS_LIVE_TEST_ALLOWED_COMPANY_IDS);
const allowedNumbers = parseCsv(process.env.SMS_LIVE_TEST_ALLOWED_NUMBERS);

const blockers = [];
const warnings = [];

if (!company) blockers.push("company_not_found");
if (company?.status !== "active") blockers.push(`company_status_${company?.status}`);
if (!wallet) blockers.push("wallet_not_found");
if ((wallet?.available_sms ?? 0) < 3)
  warnings.push(`wallet_low_for_3_recipients: ${wallet?.available_sms ?? 0} SMS`);
if (!tx?.live_enabled) blockers.push("transactional_live_enabled_false");
if (!promo && !tx) blockers.push("no_active_cl_rate_plan");
if (promo && !promo.campaigns_enabled)
  blockers.push("promotional_campaigns_enabled_false");
else if (!promo && tx && !tx.campaigns_enabled)
  blockers.push("transactional_campaigns_enabled_false (campañas usan promotional)");
if (promo?.api_enabled || tx?.api_enabled) warnings.push("api_enabled_true_on_some_row");
const maxTps = promo?.max_tps ?? tx?.max_tps;
if (maxTps != null && Number(maxTps) !== 1)
  warnings.push(`max_tps_not_1: ${maxTps}`);
if (tx?.rate_plan_id !== EXPECTED_RATE_PLAN && promo?.rate_plan_id !== EXPECTED_RATE_PLAN)
  warnings.push("rate_plan_id_mismatch_vs_expected_retail");

if (!allowedCompanies.includes(COMPANY_ID))
  blockers.push("company_not_in_SMS_LIVE_TEST_ALLOWED_COMPANY_IDS");
if (allowedNumbers.length === 0)
  blockers.push("SMS_LIVE_TEST_ALLOWED_NUMBERS_empty");
if (allowedNumbers.length > 5)
  warnings.push("allowlist_has_many_numbers");

const activeRoute =
  routes.find((r) => r.status === "active" || r.status === "testing") ?? null;
if (!activeRoute) blockers.push("no_active_cl_route_in_sample");

const port = process.env.PORT || "8787";
let health = { port, ok: false };
try {
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  health = { port, status: res.status, ok: res.ok };
} catch (e) {
  health = { port, error: e instanceof Error ? e.message : String(e) };
}

const readiness =
  blockers.length === 0
    ? warnings.length === 0
      ? "READY_PENDING_ENABLE_CAMPAIGNS"
      : "READY_WITH_WARNINGS"
    : "NOT_READY";

const out = {
  readiness,
  readiness_blockers: blockers,
  readiness_warnings: warnings,
  company,
  wallet,
  company_rate_plans: ratePlans,
  promotional_row: promo ?? null,
  transactional_row: tx ?? null,
  campaigns_count: campaigns.length,
  campaigns,
  queue_licantravel: queueLican,
  queue_global_active: queueGlobal,
  recent_panel_sms_messages: messages,
  routes_cl_sample: routes,
  active_route_guess: activeRoute,
  platform_scheduler: schedulerRow?.value ?? null,
  runtime: {
    SMS_PROVIDER_MODE: process.env.SMS_PROVIDER_MODE ?? null,
    SMS_PROVIDER: process.env.SMS_PROVIDER ?? null,
    SMS_LIVE_TEST_ENABLED: process.env.SMS_LIVE_TEST_ENABLED ?? null,
    SMS_CAMPAIGN_SKIP_NUMBER_WHITELIST:
      process.env.SMS_CAMPAIGN_SKIP_NUMBER_WHITELIST ?? null,
    SMS_QUEUE_SCHEDULER_ENABLED: process.env.SMS_QUEUE_SCHEDULER_ENABLED ?? null,
    SMS_LIVE_TEST_ALLOWED_COMPANY_IDS: allowedCompanies,
    SMS_LIVE_TEST_ALLOWED_NUMBERS_masked: allowedNumbers.map(maskPhone),
    SMS_LIVE_TEST_ALLOWED_NUMBERS_count: allowedNumbers.length,
    company_in_allowlist: allowedCompanies.includes(COMPANY_ID),
  },
  health,
  next_steps_if_authorized: [
    "SET campaigns_enabled=true on CL promotional (and transactional if mirrored) for Licantravel only",
    "Keep api_enabled=false, max_tps=1, live_enabled=true",
    "Confirm SMS_LIVE_TEST_ALLOWED_NUMBERS has 2-3 owned numbers only",
    "Create QA list + draft campaign in panel; launch only after Victor confirms",
  ],
};

console.log(JSON.stringify(out, null, 2));
await client.end();
process.exit(blockers.length > 0 ? 2 : 0);
