#!/usr/bin/env node
/**
 * QA Fase 4: GET /api/v1/messages y GET /api/v1/messages/:id
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
const QA_PREFIX = `QA Messages ${Date.now()}`;
const QA_EXT_REF = "qa-messages-001";

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

async function apiFetch(apiKey, path, method = "GET", body) {
  const headers = {
    "Content-Type": "application/json",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
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
  scopes: ["sms:send", "messages:read"],
});
if (created.status !== 200 || !created.body.plainTextKey) {
  console.error("FAIL create sandbox key", created);
  process.exit(1);
}
const sandboxKey = created.body.plainTextKey;
const sandboxKeyId = created.body.key?.id;

const sendOnly = await postPanel("/app/api/keys", cookie, {
  name: `${QA_PREFIX} send-only`,
  environment: "sandbox",
  scopes: ["sms:send"],
});
const sendOnlyKey = sendOnly.body.plainTextKey;
const sendOnlyId = sendOnly.body.key?.id;

const sent = await apiFetch(sandboxKey, "/api/v1/sms/send", "POST", {
  to: "+56912345678",
  message: "Mensaje QA consulta mensajes",
  sender: "Telvoice",
  country: "CL",
  external_reference: QA_EXT_REF,
});
if (sent.status !== 202 || !sent.body.message?.id) {
  console.error("FAIL create sandbox message", sent);
  process.exit(1);
}
const messageId = sent.body.message.id;
console.log("OK: mensaje sandbox creado", messageId);

const detail = await apiFetch(sandboxKey, `/api/v1/messages/${messageId}`);
if (detail.status !== 200 || !detail.body.request_id || detail.body.message?.id !== messageId) {
  console.error("FAIL detail 200", detail);
  process.exit(1);
}
if (detail.body.message?.provider_message_id !== null || detail.body.message?.dlr_status !== null) {
  console.error("FAIL provider/dlr exposed or set", detail.body.message);
  process.exit(1);
}
console.log("OK: GET /api/v1/messages/:id 200");

const { rows: reqDetail } = await pgQuery(
  `select success, status_code, endpoint, metadata from client_api_requests where request_id = $1`,
  [detail.body.request_id],
);
if (
  !reqDetail[0] ||
  reqDetail[0].success !== true ||
  reqDetail[0].status_code !== 200 ||
  reqDetail[0].metadata?.filter_type !== "detail"
) {
  console.error("FAIL log detail", reqDetail[0]);
  process.exit(1);
}
console.log("OK: log detail");

const list = await apiFetch(sandboxKey, "/api/v1/messages?limit=20");
if (list.status !== 200 || !list.body.pagination || !Array.isArray(list.body.messages)) {
  console.error("FAIL list 200", list);
  process.exit(1);
}
if (!list.body.messages.some((m) => m.id === messageId)) {
  console.error("FAIL list missing message", list.body.messages);
  process.exit(1);
}
console.log("OK: GET /api/v1/messages 200");

const { rows: reqList } = await pgQuery(
  `select success, status_code, metadata from client_api_requests where request_id = $1`,
  [list.body.request_id],
);
if (!reqList[0] || reqList[0].metadata?.filter_type !== "list") {
  console.error("FAIL log list", reqList[0]);
  process.exit(1);
}
console.log("OK: log list");

for (const qs of [
  `status=sandbox_accepted`,
  `environment=sandbox`,
  `external_reference=${encodeURIComponent(QA_EXT_REF)}`,
]) {
  const filtered = await apiFetch(sandboxKey, `/api/v1/messages?limit=20&${qs}`);
  if (filtered.status !== 200 || !filtered.body.messages.some((m) => m.id === messageId)) {
    console.error("FAIL filter", qs, filtered);
    process.exit(1);
  }
  console.log("OK: filter", qs.split("=")[0]);
}

const badId = await apiFetch(sandboxKey, "/api/v1/messages/not-a-uuid");
if (badId.status !== 400 || badId.body.error?.code !== "INVALID_MESSAGE_ID") {
  console.error("FAIL invalid id", badId);
  process.exit(1);
}
console.log("OK: INVALID_MESSAGE_ID");

const missingId = "00000000-0000-4000-8000-000000000099";
const notFound = await apiFetch(sandboxKey, `/api/v1/messages/${missingId}`);
if (notFound.status !== 404 || notFound.body.error?.code !== "MESSAGE_NOT_FOUND") {
  console.error("FAIL not found", notFound);
  process.exit(1);
}
console.log("OK: MESSAGE_NOT_FOUND");

const noScope = await apiFetch(sendOnlyKey, `/api/v1/messages/${messageId}`);
if (noScope.status !== 403 || noScope.body.error?.code !== "INSUFFICIENT_SCOPE") {
  console.error("FAIL insufficient scope", noScope);
  process.exit(1);
}
console.log("OK: INSUFFICIENT_SCOPE");

const badLimit = await apiFetch(sandboxKey, "/api/v1/messages?limit=101");
if (badLimit.status !== 400 || badLimit.body.error?.code !== "INVALID_LIMIT") {
  console.error("FAIL invalid limit", badLimit);
  process.exit(1);
}
console.log("OK: INVALID_LIMIT");

const badStatus = await apiFetch(sandboxKey, "/api/v1/messages?status=invalid_status");
if (badStatus.status !== 400 || badStatus.body.error?.code !== "INVALID_STATUS") {
  console.error("FAIL invalid status", badStatus);
  process.exit(1);
}
console.log("OK: INVALID_STATUS");

const badEnv = await apiFetch(sandboxKey, "/api/v1/messages?environment=staging");
if (badEnv.status !== 400 || badEnv.body.error?.code !== "INVALID_ENVIRONMENT") {
  console.error("FAIL invalid environment", badEnv);
  process.exit(1);
}
console.log("OK: INVALID_ENVIRONMENT");

const { rows: otherMsg } = await pgQuery(
  `select id from sms_api_messages where company_id <> $1 limit 1`,
  [DEMO],
);
if (otherMsg[0]?.id) {
  const isolated = await apiFetch(sandboxKey, `/api/v1/messages/${otherMsg[0].id}`);
  if (isolated.status !== 404 || isolated.body.error?.code !== "MESSAGE_NOT_FOUND") {
    console.error("FAIL cross-company isolation", isolated);
    process.exit(1);
  }
  console.log("OK: aislamiento cross-company");
} else {
  console.log("OK: aislamiento (sin fixture otra empresa, validado por company_id en servicio)");
}

const { rows: msgRow } = await pgQuery(
  `select provider_message_id, dlr_status from sms_api_messages where id = $1`,
  [messageId],
);
if (msgRow[0]?.provider_message_id || msgRow[0]?.dlr_status) {
  console.error("FAIL SMS real fields set");
  process.exit(1);
}
console.log("OK: sin SMS real/proveedor/DLR");

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
if (
  !html.includes("/api/v1/messages?limit=20") ||
  !html.includes("/api/v1/messages/{message_id}") ||
  !html.includes("Los mensajes consultados corresponden a registros creados por API")
) {
  console.error("FAIL UI documentación mensajes");
  process.exit(1);
}
if (html.includes(sandboxKey) || html.includes("key_hash")) {
  console.error("FAIL secret/hash in HTML");
  process.exit(1);
}
console.log("OK: UI /app/api");

const balance = await apiFetch(sandboxKey, "/api/v1/balance");
if (balance.status !== 403) {
  console.error("FAIL balance scope isolation", balance.status);
  process.exit(1);
}
console.log("OK: /api/v1/balance scope");

const sendAgain = await apiFetch(sandboxKey, "/api/v1/sms/send", "POST", {
  to: "+56912345678",
  message: "Smoke QA messages",
});
if (sendAgain.status !== 202) {
  console.error("FAIL sms/send smoke", sendAgain);
  process.exit(1);
}
console.log("OK: /api/v1/sms/send smoke");

for (const p of [
  "/app/api",
  "/app/wallet",
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

await pgQuery(`delete from client_api_requests where api_key_id = any($1::uuid[])`, [
  [sandboxKeyId, sendOnlyId],
]);
await pgQuery(`delete from sms_api_messages where api_key_id = any($1::uuid[])`, [
  [sandboxKeyId, sendOnlyId],
]);
await pgQuery(`delete from sms_api_messages where external_reference like $1`, [
  `${QA_EXT_REF}%`,
]);
await pgQuery(`delete from client_api_keys where id = any($1::uuid[])`, [
  [sandboxKeyId, sendOnlyId],
]);
console.log("OK: limpieza QA");

console.log("\n✅ verify-api-v1-messages-qa completado");
