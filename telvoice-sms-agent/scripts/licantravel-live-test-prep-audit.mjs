/**
 * Auditoría read-only: readiness Licantravel para live_test.
 * Uso en VPS: node scripts/licantravel-live-test-prep-audit.mjs
 */
import "dotenv/config";
import pg from "pg";

const COMPANY_ID = "54601663-f35f-4c26-9410-a9d2dc0ad697";
const WALLET_ID = "6d873673-947b-4657-96f0-031d14db45fd";

function maskPhone(p) {
  const d = String(p).replace(/[^\d+]/g, "");
  if (d.length < 6) return "***";
  return d.slice(0, 4) + "****" + d.slice(-3);
}

function parseCsv(v) {
  return String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
  await client.query(
    "SELECT id, name, status, country, billing_email, metadata FROM companies WHERE id = $1",
    [COMPANY_ID],
  )
).rows[0];

const wallet = (
  await client.query(
    "SELECT id, company_id, available_sms, status FROM company_sms_wallets WHERE id = $1",
    [WALLET_ID],
  )
).rows[0];

const ratePlans = (
  await client.query(
    `SELECT crp.id, crp.country, crp.traffic_type, crp.status, crp.live_enabled,
            crp.campaigns_enabled, crp.api_enabled, crp.rate_plan_id,
            srp.name AS rate_plan_name, srp.code AS rate_plan_code
     FROM company_rate_plans crp
     LEFT JOIN sms_rate_plans srp ON srp.id = crp.rate_plan_id
     WHERE crp.company_id = $1
     ORDER BY crp.country, crp.traffic_type`,
    [COMPANY_ID],
  )
).rows;

const activeTx = ratePlans.find(
  (r) =>
    r.status === "active" &&
    String(r.country).toUpperCase() === "CL" &&
    String(r.traffic_type).toLowerCase() === "transactional",
);

let routeProbe = null;
if (activeTx?.rate_plan_id) {
  const routes = (
    await client.query(
      `SELECT r.id, r.name, r.status, r.country, r.traffic_type,
              p.id AS provider_id, p.code AS provider_code, p.name AS provider_name,
              p.status AS provider_status, p.default_sender_id
       FROM sms_routes r
       JOIN sms_providers p ON p.id = r.provider_id
       WHERE r.rate_plan_id = $1 AND r.country = 'CL'
       ORDER BY r.priority ASC NULLS LAST, r.created_at ASC
       LIMIT 5`,
      [activeTx.rate_plan_id],
    )
  ).rows;
  const activeRoute = routes.find((r) => r.status === "active" || r.status === "testing");
  routeProbe = { routes_sample: routes, active_route: activeRoute ?? null };
}

const panelCount = (
  await client.query(
    "SELECT count(*)::int AS c FROM panel_sms_messages WHERE company_id = $1",
    [COMPANY_ID],
  )
).rows[0].c;

const debitCount = (
  await client.query(
    `SELECT count(*)::int AS c FROM wallet_transactions
     WHERE company_id = $1 AND type = 'sms_debit'`,
    [COMPANY_ID],
  )
).rows[0].c;

const verifyRaw = process.env.TELVOICE_VERIFY_NUMBERS ?? "";
const verifyPhones = verifyRaw
  .split("|")
  .map((p) => p.split(":")[0]?.trim())
  .filter(Boolean);

const allowedCompanies = parseCsv(process.env.SMS_LIVE_TEST_ALLOWED_COMPANY_IDS);
const allowedNumbers = parseCsv(process.env.SMS_LIVE_TEST_ALLOWED_NUMBERS);

const out = {
  company: company ?? null,
  wallet: wallet ?? null,
  company_rate_plans: ratePlans,
  transactional_assignment: activeTx ?? null,
  live_enabled_on_transactional: activeTx?.live_enabled === true,
  route_probe: routeProbe,
  counts: {
    panel_sms_messages: panelCount,
    sms_debit_wallet_tx: debitCount,
  },
  runtime: {
    SMS_PROVIDER_MODE: process.env.SMS_PROVIDER_MODE ?? null,
    SMS_PROVIDER: process.env.SMS_PROVIDER ?? null,
    SMS_LIVE_TEST_ENABLED: process.env.SMS_LIVE_TEST_ENABLED ?? null,
    SMS_LIVE_TEST_ALLOWED_COMPANY_IDS: allowedCompanies,
    SMS_LIVE_TEST_ALLOWED_NUMBERS: allowedNumbers.map(maskPhone),
    SMS_LIVE_TEST_ALLOWED_NUMBERS_raw_count: allowedNumbers.length,
    TELVOICE_VERIFY_NUMBERS_phones_masked: verifyPhones.map(maskPhone),
    TELVOICE_VERIFY_NUMBERS_count: verifyPhones.length,
  },
  readiness_blockers: [],
};

if (!company) out.readiness_blockers.push("company_not_found");
if (company && company.status !== "active")
  out.readiness_blockers.push(`company_status_${company.status}`);
if (!wallet) out.readiness_blockers.push("wallet_not_found");
if (wallet && wallet.status !== "active")
  out.readiness_blockers.push(`wallet_status_${wallet.status}`);
if (!wallet || wallet.available_sms < 1)
  out.readiness_blockers.push("insufficient_sms_balance");
if (!activeTx) out.readiness_blockers.push("no_active_transactional_rate_plan");
if (activeTx && !activeTx.live_enabled)
  out.readiness_blockers.push("live_enabled_false");
if (!routeProbe?.active_route)
  out.readiness_blockers.push("no_active_route");
if (
  routeProbe?.active_route &&
  !["active"].includes(routeProbe.active_route.provider_status)
)
  out.readiness_blockers.push(`provider_status_${routeProbe.active_route.provider_status}`);
if (
  allowedCompanies.length > 0 &&
  !allowedCompanies.includes(COMPANY_ID)
)
  out.readiness_blockers.push("company_not_in_live_test_allowlist");

console.log(JSON.stringify(out, null, 2));
await client.end();
