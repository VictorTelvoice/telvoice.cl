#!/usr/bin/env node
/**
 * QA Fase 3: POST /api/v1/sms/send sandbox only.
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
const QA_PREFIX = `QA SMS Send ${Date.now()}`;
const QA_EXT_REF = "qa-sandbox-001";

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

async function postSms(apiKey, payload) {
  const headers = {
    "Content-Type": "application/json",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
  const res = await fetch(`${BASE}/api/v1/sms/send`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
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
  name: `${QA_PREFIX} sandbox`,
  environment: "sandbox",
  scopes: ["sms:send"],
});
if (created.status !== 200 || !created.body.plainTextKey) {
  console.error("FAIL create sandbox key", created);
  process.exit(1);
}
const sandboxKey = created.body.plainTextKey;
const sandboxKeyId = created.body.key?.id;

const ok = await postSms(sandboxKey, {
  to: "+56912345678",
  message: "Mensaje QA sandbox Telvoice",
  sender: "Telvoice",
  country: "CL",
  external_reference: QA_EXT_REF,
});
if (ok.status !== 202 || !ok.body.success || !ok.body.request_id) {
  console.error("FAIL send 202", ok);
  process.exit(1);
}
if (ok.body.message?.status !== "sandbox_accepted" || ok.body.message?.cost_sms !== 0) {
  console.error("FAIL message shape", ok.body);
  process.exit(1);
}
console.log("OK: 202 sandbox_accepted", ok.body.message.id);

const { rows: msgRows } = await pgQuery(
  `select id, status, cost_sms, provider_message_id, dlr_status, environment
   from sms_api_messages where external_reference = $1 limit 1`,
  [QA_EXT_REF],
);
if (!msgRows[0] || msgRows[0].status !== "sandbox_accepted" || msgRows[0].cost_sms !== 0) {
  console.error("FAIL sms_api_messages row", msgRows[0]);
  process.exit(1);
}
if (msgRows[0].provider_message_id || msgRows[0].dlr_status) {
  console.error("FAIL provider fields set");
  process.exit(1);
}
if (msgRows[0].environment !== "sandbox") {
  console.error("FAIL environment not sandbox");
  process.exit(1);
}
console.log("OK: sms_api_messages");

const { rows: reqRows } = await pgQuery(
  `select success, status_code, endpoint, metadata from client_api_requests where request_id = $1`,
  [ok.body.request_id],
);
if (!reqRows[0] || reqRows[0].success !== true || reqRows[0].status_code !== 202) {
  console.error("FAIL client_api_requests", reqRows[0]);
  process.exit(1);
}
console.log("OK: client_api_requests log");

const missing = await postSms(null, { to: "+56912345678", message: "x" });
if (missing.status !== 401 || missing.body.error?.code !== "MISSING_API_KEY") {
  console.error("FAIL missing key", missing);
  process.exit(1);
}
console.log("OK: 401 MISSING_API_KEY");

const noScope = await postPanel("/app/api/keys", cookie, {
  name: `${QA_PREFIX} no-scope`,
  environment: "sandbox",
  scopes: ["balance:read"],
});
const noScopeKey = noScope.body.plainTextKey;
const noScopeId = noScope.body.key?.id;
const scopeFail = await postSms(noScopeKey, {
  to: "+56912345678",
  message: "test",
});
if (scopeFail.status !== 403 || scopeFail.body.error?.code !== "INSUFFICIENT_SCOPE") {
  console.error("FAIL insufficient scope", scopeFail);
  process.exit(1);
}
console.log("OK: 403 INSUFFICIENT_SCOPE");

const liveKey = await postPanel("/app/api/keys", cookie, {
  name: `${QA_PREFIX} live`,
  environment: "production",
  scopes: ["sms:send"],
});
const livePlain = liveKey.body.plainTextKey;
const liveId = liveKey.body.key?.id;
const liveFail = await postSms(livePlain, {
  to: "+56912345678",
  message: "test",
});
if (liveFail.status !== 403 || liveFail.body.error?.code !== "PRODUCTION_SEND_NOT_ENABLED") {
  console.error("FAIL production key", liveFail);
  process.exit(1);
}
console.log("OK: 403 PRODUCTION_SEND_NOT_ENABLED");

const badRecipient = await postSms(sandboxKey, {
  to: "56912345678",
  message: "test",
});
if (badRecipient.status !== 400 || badRecipient.body.error?.code !== "INVALID_RECIPIENT") {
  console.error("FAIL invalid recipient", badRecipient);
  process.exit(1);
}
console.log("OK: INVALID_RECIPIENT");

const emptyMsg = await postSms(sandboxKey, {
  to: "+56912345678",
  message: "   ",
});
if (emptyMsg.status !== 400 || emptyMsg.body.error?.code !== "MESSAGE_REQUIRED") {
  console.error("FAIL message required", emptyMsg);
  process.exit(1);
}
console.log("OK: MESSAGE_REQUIRED");

const longMsg = await postSms(sandboxKey, {
  to: "+56912345678",
  message: "x".repeat(919),
});
if (longMsg.status !== 400 || longMsg.body.error?.code !== "MESSAGE_TOO_LONG") {
  console.error("FAIL message too long", longMsg);
  process.exit(1);
}
console.log("OK: MESSAGE_TOO_LONG");

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

const page = await fetch(`${BASE}/app/api`, { headers: { Cookie: cookie } });
const html = await page.text();
if (!html.includes("Actividad reciente de API") || !html.includes("sandbox")) {
  console.error("FAIL UI");
  process.exit(1);
}
if (html.includes(sandboxKey)) {
  console.error("FAIL key in HTML");
  process.exit(1);
}
console.log("OK: UI /app/api");

const balance = await fetch(`${BASE}/api/v1/balance`, {
  headers: { Authorization: `Bearer ${sandboxKey}` },
});
if (balance.status !== 403) {
  console.error("FAIL balance with sms-only key", balance.status);
  process.exit(1);
}
console.log("OK: /api/v1/balance still protected by scope");

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
  await pgQuery(`delete from sms_api_messages where api_key_id = any($1::uuid[])`, [
    qaKeyIds,
  ]);
  await pgQuery(`delete from client_api_keys where id = any($1::uuid[])`, [qaKeyIds]);
}
await pgQuery(`delete from sms_api_messages where external_reference = $1`, [QA_EXT_REF]);
await pgQuery(`delete from client_api_keys where id = $1`, [noScopeId]);
await pgQuery(`delete from client_api_keys where id = $1`, [liveId]);
console.log("OK: limpieza QA");

console.log("\n✅ verify-api-v1-sms-send-qa completado");
