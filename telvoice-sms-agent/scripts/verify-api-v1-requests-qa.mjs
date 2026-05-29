#!/usr/bin/env node
/**
 * QA Fase 2.5: logs client_api_requests + request_id en /api/v1/balance.
 */
import "dotenv/config";
import jwt from "jsonwebtoken";
import pg from "pg";

const BASE = (process.env.PUBLIC_APP_URL || "https://agent.telvoice.cl").replace(
  /\/$/,
  "",
);
const DEMO = process.env.QA_COMPANY_ID || "6cd1db92-d5c7-45e0-8548-df8907843350";
const DEMO_EMAIL = "cliente.demo@telvoice.cl";
const CLIENT_COOKIE = "tv_client_session";
const QA_PREFIX = `QA ReqLog ${Date.now()}`;

if (!process.env.API_KEY_PEPPER?.trim()) {
  console.error("FAIL: API_KEY_PEPPER requerido");
  process.exit(1);
}

async function pgQuery(text, params) {
  const conn = process.env.DATABASE_URL?.trim();
  const client = new pg.Client({
    connectionString: conn,
    ssl: conn?.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    return await client.query(text, params);
  } finally {
    await client.end();
  }
}

async function clientCookie() {
  const { rows } = await pgQuery(
    `select au.id, au.email, au.name, up.role from admin_users au
     join user_profiles up on up.admin_user_id = au.id
     where lower(au.email) = lower($1)`,
    [DEMO_EMAIL],
  );
  const u = rows[0];
  if (!u) throw new Error("Usuario demo no encontrado");
  const token = jwt.sign(
    { sub: u.id, email: u.email, name: u.name, role: u.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h", issuer: "telvoice-sms-agent", audience: "telvoice-admin" },
  );
  return `${CLIENT_COOKIE}=${token}`;
}

async function postPanel(path, cookie, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function getBalance(apiKey) {
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  const res = await fetch(`${BASE}/api/v1/balance`, { headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function findLogByRequestId(requestId) {
  const { rows } = await pgQuery(
    `select request_id, success, error_code, status_code, company_id, api_key_id
     from client_api_requests where request_id = $1 limit 1`,
    [requestId],
  );
  return rows[0] ?? null;
}

async function walletSnapshot(companyId) {
  const { rows } = await pgQuery(
    `select available_sms, reserved_sms from company_sms_wallets where company_id = $1 and country = 'CL' limit 1`,
    [companyId],
  );
  const { rows: tx } = await pgQuery(
    `select count(*)::int as c from wallet_transactions wt
     join company_sms_wallets w on w.id = wt.wallet_id where w.company_id = $1`,
    [companyId],
  );
  return {
    available: rows[0]?.available_sms ?? null,
    reserved: rows[0]?.reserved_sms ?? null,
    txCount: tx[0]?.c ?? 0,
  };
}

const cookie = await clientCookie();
const beforeWallet = await walletSnapshot(DEMO);

const created = await postPanel("/app/api/keys", cookie, {
  name: `${QA_PREFIX} full`,
  environment: "sandbox",
  scopes: ["balance:read"],
});
if (created.status !== 200 || !created.body.plainTextKey) {
  console.error("FAIL create key", created);
  process.exit(1);
}
const fullKey = created.body.plainTextKey;
const keyId = created.body.key?.id;

const ok = await getBalance(fullKey);
if (ok.status !== 200 || !ok.body.success || !ok.body.request_id) {
  console.error("FAIL balance ok", ok);
  process.exit(1);
}
const okLog = await findLogByRequestId(ok.body.request_id);
if (!okLog || okLog.success !== true || okLog.error_code !== null) {
  console.error("FAIL success log", okLog);
  process.exit(1);
}
console.log("OK: 200 + request_id + log success");

const missing = await getBalance(null);
if (missing.status !== 401 || !missing.body.request_id || missing.body.error?.code !== "MISSING_API_KEY") {
  console.error("FAIL missing", missing);
  process.exit(1);
}
const missLog = await findLogByRequestId(missing.body.request_id);
if (!missLog || missLog.error_code !== "MISSING_API_KEY") {
  console.error("FAIL missing log", missLog);
  process.exit(1);
}
console.log("OK: MISSING_API_KEY log");

const invalid = await getBalance("tlv_test_invalidkey000000000000000000");
if (invalid.status !== 401 || !invalid.body.request_id) {
  console.error("FAIL invalid", invalid);
  process.exit(1);
}
const invLog = await findLogByRequestId(invalid.body.request_id);
if (!invLog || invLog.error_code !== "INVALID_API_KEY") {
  console.error("FAIL invalid log", invLog);
  process.exit(1);
}
console.log("OK: INVALID_API_KEY log");

await postPanel(`/app/api/keys/${keyId}/pause`, cookie, {});
const paused = await getBalance(fullKey);
if (paused.status !== 403 || paused.body.error?.code !== "API_KEY_PAUSED" || !paused.body.request_id) {
  console.error("FAIL paused", paused);
  process.exit(1);
}
const pauseLog = await findLogByRequestId(paused.body.request_id);
if (!pauseLog || pauseLog.error_code !== "API_KEY_PAUSED" || pauseLog.api_key_id !== keyId) {
  console.error("FAIL paused log", pauseLog);
  process.exit(1);
}
console.log("OK: API_KEY_PAUSED log");

await postPanel(`/app/api/keys/${keyId}/activate`, cookie, {});

const noScope = await postPanel("/app/api/keys", cookie, {
  name: `${QA_PREFIX} no-scope`,
  environment: "sandbox",
  scopes: ["messages:read"],
});
const noScopeKey = noScope.body.plainTextKey;
const noScopeId = noScope.body.key?.id;
const scopeReq = await getBalance(noScopeKey);
if (scopeReq.status !== 403 || scopeReq.body.error?.code !== "INSUFFICIENT_SCOPE" || !scopeReq.body.request_id) {
  console.error("FAIL scope", scopeReq);
  process.exit(1);
}
const scopeLog = await findLogByRequestId(scopeReq.body.request_id);
if (!scopeLog || scopeLog.error_code !== "INSUFFICIENT_SCOPE") {
  console.error("FAIL scope log", scopeLog);
  process.exit(1);
}
console.log("OK: INSUFFICIENT_SCOPE log");

const page = await fetch(`${BASE}/app/api`, { headers: { Cookie: cookie } });
const html = await page.text();
if (!html.includes("Actividad reciente de API")) {
  console.error("FAIL UI activity section");
  process.exit(1);
}
if (html.includes(fullKey)) {
  console.error("FAIL secrets in HTML");
  process.exit(1);
}
if (html.includes(`Bearer ${fullKey}`)) {
  console.error("FAIL Authorization header value in HTML");
  process.exit(1);
}
console.log("OK: UI actividad sin secrets");

const afterWallet = await walletSnapshot(DEMO);
if (
  beforeWallet.available !== afterWallet.available ||
  beforeWallet.reserved !== afterWallet.reserved ||
  beforeWallet.txCount !== afterWallet.txCount
) {
  console.error("FAIL wallet changed", { beforeWallet, afterWallet });
  process.exit(1);
}
console.log("OK: wallet intacto");

const smsSend = await fetch(`${BASE}/api/v1/sms/send`, { method: "POST" });
if (smsSend.status !== 404) {
  console.error("FAIL sms/send exists", smsSend.status);
  process.exit(1);
}
console.log("OK: /api/v1/sms/send no existe");

for (const p of [
  "/app/api",
  "/app/wallet",
  "/app/orders",
  "/app/support",
  "/app/templates",
  "/app/settings",
  "/admin/support",
]) {
  const r = await fetch(`${BASE}${p}`, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  if (r.status !== 200 && r.status !== 302) {
    console.error("FAIL smoke", p, r.status);
    process.exit(1);
  }
  console.log("OK: smoke", p);
}

const { rows: qaKeys } = await pgQuery(
  `select id from client_api_keys where company_id = $1 and name ilike $2`,
  [DEMO, `%${QA_PREFIX}%`],
);
const qaKeyIds = qaKeys.map((r) => r.id);
if (qaKeyIds.length) {
  await pgQuery(`delete from client_api_requests where api_key_id = any($1::uuid[])`, [
    qaKeyIds,
  ]);
  await pgQuery(`delete from client_api_keys where id = any($1::uuid[])`, [qaKeyIds]);
}
await pgQuery(`delete from client_api_keys where id = $1`, [noScopeId]);
console.log("OK: limpieza QA");

console.log("\n✅ verify-api-v1-requests-qa completado");
