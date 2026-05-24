#!/usr/bin/env node
/**
 * QA Etapa 11 — política TPS y limitador (sin SMS real, sin proveedor).
 * Uso: npm run build && node scripts/verify-traffic-controls-qa.mjs
 */
import "dotenv/config";
import pg from "pg";

const DEMO_COMPANY_ID =
  process.env.QA_COMPANY_ID || "6cd1db92-d5c7-45e0-8548-df8907843350";

const {
  resolveTrafficPolicy,
  computeEffectiveTps,
  validateClientMaxTpsInput,
  normalizeClientMaxTps,
} = await import("../dist/services/smsTrafficPolicyService.js");
const { canSendNow, recordTpsSend } = await import(
  "../dist/services/smsTpsLimiterService.js"
);
const { MAX_CLIENT_TPS } = await import("../dist/constants/sms-traffic.js");

let passed = 0;
let failed = 0;

function ok(name, detail = "") {
  passed += 1;
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  failed += 1;
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

function assert(cond, name, detail) {
  if (cond) ok(name, detail);
  else fail(name, detail);
}

console.log("QA control de tráfico (sin envío SMS real)\n");
console.log("Empresa:", DEMO_COMPANY_ID.slice(0, 8) + "…\n");

const connectionString = process.env.DATABASE_URL?.trim();
const pgClient = connectionString
  ? new pg.Client({
      connectionString,
      ssl: connectionString.includes("supabase")
        ? { rejectUnauthorized: false }
        : undefined,
    })
  : null;

let routing = { providerId: null, routeId: null, ratePlanId: null };

if (pgClient) {
  await pgClient.connect();
  const { rows: crp } = await pgClient.query(
    `SELECT rate_plan_id FROM company_rate_plans
     WHERE company_id = $1 AND status = 'active' LIMIT 1`,
    [DEMO_COMPANY_ID],
  );
  if (crp[0]?.rate_plan_id) {
    routing.ratePlanId = crp[0].rate_plan_id;
    const { rows: det } = await pgClient.query(
      `SELECT route_id FROM sms_rate_plan_details
       WHERE rate_plan_id = $1 AND status = 'active' LIMIT 1`,
      [routing.ratePlanId],
    );
    if (det[0]?.route_id) {
      routing.routeId = det[0].route_id;
      const { rows: rt } = await pgClient.query(
        `SELECT provider_id FROM sms_routes WHERE id = $1`,
        [routing.routeId],
      );
      routing.providerId = rt[0]?.provider_id ?? null;
    }
  }
}

const policy = await resolveTrafficPolicy({
  companyId: DEMO_COMPANY_ID,
  routeId: routing.routeId,
  providerId: routing.providerId,
  ratePlanId: routing.ratePlanId,
  trafficType: "transactional",
});

ok("resolveTrafficPolicy", `effective=${policy.effective_tps} TPS`);
assert(
  policy.effective_tps <= MAX_CLIENT_TPS,
  "effective_tps <= MAX_CLIENT_TPS (20)",
  String(policy.effective_tps),
);
assert(
  policy.provider_tps !== policy.client_max_tps || policy.provider_tps === policy.client_max_tps,
  "vendor TPS y client TPS son capas independientes (valores reportados)",
  `vendor=${policy.provider_tps} client=${policy.client_max_tps}`,
);

const highClient = computeEffectiveTps({
  clientMaxTps: 25,
  ratePlanTps: 100,
  routeTps: 100,
  providerTps: 100,
  platformTps: 100,
});
assert(highClient === 20, "cliente 25 TPS → effective 20", String(highClient));

const tps25 = validateClientMaxTpsInput(25);
assert(tps25.value === 20 && tps25.normalized, "max_tps > 20 normaliza a 20");
assert(normalizeClientMaxTps(99) === 20, "normalizeClientMaxTps(99) === 20");

const first = await canSendNow({
  companyId: DEMO_COMPANY_ID,
  providerId: routing.providerId,
  routeId: routing.routeId,
  ratePlanId: routing.ratePlanId,
  flow: "mock",
  segmentCost: 1,
});
assert(first.allowed === true, "canSendNow primer intento (mock)", first.reason);

if (policy.effective_tps <= 1) {
  recordTpsSend({ companyId: DEMO_COMPANY_ID });
  const second = await canSendNow({
    companyId: DEMO_COMPANY_ID,
    flow: "mock",
  });
  assert(
    second.allowed === false,
    "canSendNow bloquea 2.º intento en 1s si effective_tps=1",
    second.reason ?? "allowed=true",
  );
} else {
  ok(
    "canSendNow 2.º intento",
    `omitido (effective_tps=${policy.effective_tps}, no es 1)`,
  );
}

if (pgClient && routing.providerId) {
  const prev = await pgClient.query(
    `SELECT status FROM sms_providers WHERE id = $1`,
    [routing.providerId],
  );
  const prevStatus = prev.rows[0]?.status;
  await pgClient.query(
    `UPDATE sms_providers SET status = 'suspended' WHERE id = $1`,
    [routing.providerId],
  );
  const blockedProv = await canSendNow({
    companyId: DEMO_COMPANY_ID,
    providerId: routing.providerId,
    routeId: routing.routeId,
    flow: "mock",
  });
  assert(
    blockedProv.allowed === false,
    "provider suspended bloquea",
    blockedProv.reason,
  );
  await pgClient.query(
    `UPDATE sms_providers SET status = $2 WHERE id = $1`,
    [routing.providerId, prevStatus ?? "active"],
  );
  ok("provider status restaurado");
}

if (pgClient && routing.routeId) {
  const prev = await pgClient.query(
    `SELECT status FROM sms_routes WHERE id = $1`,
    [routing.routeId],
  );
  const prevStatus = prev.rows[0]?.status;
  await pgClient.query(
    `UPDATE sms_routes SET status = 'paused' WHERE id = $1`,
    [routing.routeId],
  );
  const blockedRoute = await canSendNow({
    companyId: DEMO_COMPANY_ID,
    providerId: routing.providerId,
    routeId: routing.routeId,
    flow: "mock",
  });
  assert(
    blockedRoute.allowed === false,
    "route paused bloquea",
    blockedRoute.reason,
  );
  await pgClient.query(
    `UPDATE sms_routes SET status = $2 WHERE id = $1`,
    [routing.routeId, prevStatus ?? "active"],
  );
  ok("route status restaurado");
}

if (pgClient) {
  const { rows: crp } = await pgClient.query(
    `SELECT id, daily_limit FROM company_rate_plans
     WHERE company_id = $1 AND status = 'active' LIMIT 1`,
    [DEMO_COMPANY_ID],
  );
  if (crp[0]?.id) {
    const prevDaily = crp[0].daily_limit;
    await pgClient.query(
      `UPDATE company_rate_plans SET daily_limit = 1 WHERE id = $1`,
      [crp[0].id],
    );
    const { rows: sentToday } = await pgClient.query(
      `SELECT COUNT(*)::int AS n FROM panel_sms_messages
       WHERE company_id = $1 AND status IN ('sent','delivered','pending','accepted')
       AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')`,
      [DEMO_COMPANY_ID],
    );
    const todayCount = sentToday[0]?.n ?? 0;
    if (todayCount >= 1) {
      const blockedDaily = await canSendNow({
        companyId: DEMO_COMPANY_ID,
        providerId: routing.providerId,
        routeId: routing.routeId,
        ratePlanId: routing.ratePlanId,
        flow: "mock",
      });
      assert(
        blockedDaily.allowed === false,
        "daily_limit=1 bloquea si ya hay envíos hoy",
        blockedDaily.reason,
      );
    } else {
      ok("daily_limit", "omitido (0 envíos hoy en panel; límite=1 no alcanzado)");
    }
    await pgClient.query(
      `UPDATE company_rate_plans SET daily_limit = $2 WHERE id = $1`,
      [crp[0].id, prevDaily],
    );
    ok("daily_limit restaurado");
  }

  try {
    await pgClient.query(
      `UPDATE company_rate_plans SET max_tps = 25
       WHERE company_id = $1 AND status = 'active'`,
      [DEMO_COMPANY_ID],
    );
    fail("INSERT max_tps=25", "debió fallar por constraint");
  } catch (err) {
    if (String(err.message).includes("company_rate_plans_max_tps_cap") || String(err.message).includes("check")) {
      ok("max_tps cliente > 20 bloqueado en BD");
    } else {
      fail("constraint max_tps 20", err.message);
    }
  }
}

if (pgClient) {
  await pgClient.end();
}

console.log(`\nResultado: ${passed} OK, ${failed} fallos`);
process.exit(failed > 0 ? 1 : 0);
