/**
 * Asigna TELVOICE CL Retail a Licantravel (sin enviar SMS).
 * Uso VPS: cd /var/www/telvoice-sms-agent && node scripts/assign-licantravel-rate-plan.mjs
 */
import "dotenv/config";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const COMPANY_ID = "54601663-f35f-4c26-9410-a9d2dc0ad697";
const WALLET_ID = "6d873673-947b-4657-96f0-031d14db45fd";
const RATE_PLAN_ID = "5002ddd5-0732-4bf5-affd-d1e692ca39f0";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const { assignCompanyRatePlan } = await import(
  pathToFileURL(join(root, "dist/services/companyRatePlanService.js")).href
);
const { resolveRouteForMessage } = await import(
  pathToFileURL(join(root, "dist/services/smsRoutingService.js")).href
);
const { listActiveCompanyRatePlans } = await import(
  pathToFileURL(join(root, "dist/services/companyRatePlanService.js")).href
);

function suggestSenderIdFromCompanyName(companyName) {
  const base = String(companyName ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 11);
  return base || "TELVOICE";
}

const cs = process.env.DATABASE_URL?.trim();
if (!cs) throw new Error("missing DATABASE_URL");
const client = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});
await client.connect();

const walletBefore = (
  await client.query(
    "SELECT available_sms FROM company_sms_wallets WHERE id = $1",
    [WALLET_ID],
  )
).rows[0];

const panelBefore = (
  await client.query(
    "SELECT count(*)::int AS c FROM panel_sms_messages WHERE company_id = $1",
    [COMPANY_ID],
  )
).rows[0].c;

const debitBefore = (
  await client.query(
    `SELECT count(*)::int AS c FROM wallet_transactions
     WHERE company_id = $1 AND type = 'sms_debit'`,
    [COMPANY_ID],
  )
).rows[0].c;

const existing = await listActiveCompanyRatePlans(COMPANY_ID, "CL");
if (existing.length > 0) {
  console.log(
    JSON.stringify(
      {
        action: "skipped_already_assigned",
        existing_plans: existing.map((r) => ({
          id: r.id,
          traffic_type: r.traffic_type,
          live_enabled: r.live_enabled,
          campaigns_enabled: r.campaigns_enabled,
          rate_plan_id: r.rate_plan_id,
        })),
      },
      null,
      2,
    ),
  );
} else {
  const primary = await assignCompanyRatePlan({
    companyId: COMPANY_ID,
    ratePlanId: RATE_PLAN_ID,
    country: "CL",
    trafficType: "transactional",
    liveEnabled: true,
    campaignsEnabled: false,
    apiEnabled: false,
    maxTps: 1,
    dailyLimit: null,
    monthlyLimit: null,
  });

  const allPlans = await listActiveCompanyRatePlans(COMPANY_ID, "CL");

  let resolved = null;
  try {
    resolved = await resolveRouteForMessage({
      companyId: COMPANY_ID,
      country: "CL",
      trafficType: "transactional",
    });
  } catch (e) {
    resolved = { error: e instanceof Error ? e.message : String(e) };
  }

  const walletAfter = (
    await client.query(
      "SELECT available_sms FROM company_sms_wallets WHERE id = $1",
      [WALLET_ID],
    )
  ).rows[0];

  const panelAfter = (
    await client.query(
      "SELECT count(*)::int AS c FROM panel_sms_messages WHERE company_id = $1",
      [COMPANY_ID],
    )
  ).rows[0].c;

  const debitAfter = (
    await client.query(
      `SELECT count(*)::int AS c FROM wallet_transactions
       WHERE company_id = $1 AND type = 'sms_debit'`,
      [COMPANY_ID],
    )
  ).rows[0].c;

  const company = (
    await client.query("SELECT name FROM companies WHERE id = $1", [COMPANY_ID])
  ).rows[0];

  console.log(
    JSON.stringify(
      {
        action: "assigned",
        primary_company_rate_plan_id: primary.id,
        rate_plan_id: RATE_PLAN_ID,
        company_rate_plans_created: allPlans.map((r) => ({
          id: r.id,
          traffic_type: r.traffic_type,
          live_enabled: r.live_enabled,
          campaigns_enabled: r.campaigns_enabled,
          api_enabled: r.api_enabled,
          status: r.status,
          rate_plan_id: r.rate_plan_id,
          rate_plan_name: r.rate_plan_name,
          rate_plan_code: r.rate_plan_code,
        })),
        route_resolution:
          resolved && !resolved.error
            ? {
                route_id: resolved.route.id,
                route_name: resolved.route.name,
                route_status: resolved.route.status,
                provider_id: resolved.provider.id,
                provider_code: resolved.provider.code,
                provider_name: resolved.provider.name,
                provider_status: resolved.provider.status,
                default_sender_id: resolved.provider.default_sender_id,
              }
            : resolved,
        suggested_sender_id: suggestSenderIdFromCompanyName(company?.name),
        authorized_number: "+56934449937",
        wallet_sms: {
          before: walletBefore?.available_sms,
          after: walletAfter?.available_sms,
        },
        panel_sms_messages: { before: panelBefore, after: panelAfter },
        sms_debit_count: { before: debitBefore, after: debitAfter },
        no_sms_sent: panelBefore === panelAfter && debitBefore === debitAfter,
      },
      null,
      2,
    ),
  );
}

await client.end();
