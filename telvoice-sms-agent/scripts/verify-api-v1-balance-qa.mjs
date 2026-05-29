#!/usr/bin/env node
/**
 * QA Fase 2: GET /api/v1/balance con API Keys reales.
 * Requiere DATABASE_URL, JWT_SECRET, API_KEY_PEPPER, PUBLIC_APP_URL.
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
const QA_PREFIX = `QA Balance ${Date.now()}`;

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

async function walletSnapshot(companyId) {
  const { rows } = await pgQuery(
    `select available_sms, reserved_sms from company_sms_wallets where company_id = $1 and country = 'CL' limit 1`,
    [companyId],
  );
  const { rows: tx } = await pgQuery(
    `select count(*)::int as c from wallet_transactions wt
     join company_sms_wallets w on w.id = wt.wallet_id
     where w.company_id = $1`,
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
  scopes: ["balance:read", "messages:read"],
});
if (created.status !== 200 || !created.body.plainTextKey) {
  console.error("FAIL create key", created);
  process.exit(1);
}
const fullKey = created.body.plainTextKey;
const keyId = created.body.key?.id;
console.log("OK: key QA creada");

const ok = await getBalance(fullKey);
if (ok.status !== 200 || !ok.body.success) {
  console.error("FAIL balance válido", ok);
  process.exit(1);
}
if (typeof ok.body.balance?.available_sms !== "number") {
  console.error("FAIL balance shape", ok.body);
  process.exit(1);
}
console.log("OK: GET /api/v1/balance 200", ok.body.balance);

const missing = await getBalance(null);
if (missing.status !== 401 || missing.body.error?.code !== "MISSING_API_KEY") {
  console.error("FAIL missing auth", missing);
  process.exit(1);
}
console.log("OK: 401 MISSING_API_KEY");

const invalid = await getBalance("tlv_test_invalidkey000000000000000000");
if (invalid.status !== 401 || invalid.body.error?.code !== "INVALID_API_KEY") {
  console.error("FAIL invalid key", invalid);
  process.exit(1);
}
console.log("OK: 401 INVALID_API_KEY");

const badFormat = await getBalance("bad_format_key");
if (badFormat.status !== 401 || badFormat.body.error?.code !== "INVALID_API_KEY_FORMAT") {
  console.error("FAIL bad format", badFormat);
  process.exit(1);
}
console.log("OK: 401 INVALID_API_KEY_FORMAT");

const paused = await postPanel(`/app/api/keys/${keyId}/pause`, cookie, {});
if (paused.status !== 200) {
  console.error("FAIL pause setup", paused);
  process.exit(1);
}
const pausedReq = await getBalance(fullKey);
if (pausedReq.status !== 403 || pausedReq.body.error?.code !== "API_KEY_PAUSED") {
  console.error("FAIL paused", pausedReq);
  process.exit(1);
}
console.log("OK: 403 API_KEY_PAUSED");

await postPanel(`/app/api/keys/${keyId}/activate`, cookie, {});

const noScope = await postPanel("/app/api/keys", cookie, {
  name: `${QA_PREFIX} no-scope`,
  environment: "sandbox",
  scopes: ["messages:read"],
});
const noScopeKey = noScope.body.plainTextKey;
const noScopeId = noScope.body.key?.id;
const noScopeReq = await getBalance(noScopeKey);
if (noScopeReq.status !== 403 || noScopeReq.body.error?.code !== "INSUFFICIENT_SCOPE") {
  console.error("FAIL insufficient scope", noScopeReq);
  process.exit(1);
}
console.log("OK: 403 INSUFFICIENT_SCOPE");

const revoked = await postPanel(`/app/api/keys/${keyId}/revoke`, cookie, {
  reason: "QA revoke",
});
if (revoked.status !== 200) {
  console.error("FAIL revoke setup", revoked);
  process.exit(1);
}
const revokedReq = await getBalance(fullKey);
if (revokedReq.status !== 403 || revokedReq.body.error?.code !== "API_KEY_REVOKED") {
  console.error("FAIL revoked", revokedReq);
  process.exit(1);
}
console.log("OK: 403 API_KEY_REVOKED");

const activeAgain = await postPanel("/app/api/keys", cookie, {
  name: `${QA_PREFIX} last-used`,
  environment: "sandbox",
  scopes: ["balance:read"],
});
const activeKey = activeAgain.body.plainTextKey;
const activeKeyId = activeAgain.body.key?.id;
await getBalance(activeKey);
const { rows: usedRows } = await pgQuery(
  `select last_used_at from client_api_keys where id = $1`,
  [activeKeyId],
);
if (!usedRows[0]?.last_used_at) {
  console.error("FAIL last_used_at not updated");
  process.exit(1);
}
console.log("OK: last_used_at actualizado");

const afterWallet = await walletSnapshot(DEMO);
if (
  beforeWallet.available !== afterWallet.available ||
  beforeWallet.reserved !== afterWallet.reserved ||
  beforeWallet.txCount !== afterWallet.txCount
) {
  console.error("FAIL wallet modified", { beforeWallet, afterWallet });
  process.exit(1);
}
console.log("OK: wallet sin cambios");

const smsSend = await fetch(`${BASE}/api/v1/sms/send`, { method: "POST" });
if (smsSend.status !== 401) {
  console.error("FAIL /api/v1/sms/send auth", smsSend.status);
  process.exit(1);
}
console.log("OK: /api/v1/sms/send requiere auth");

const smokePaths = [
  "/app/api",
  "/app/wallet",
  "/app/orders",
  "/app/support",
  "/app/templates",
  "/app/settings",
  "/admin/support",
];
for (const p of smokePaths) {
  const res = await fetch(`${BASE}${p}`, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  if (res.status !== 200 && res.status !== 302) {
    console.error("FAIL smoke", p, res.status);
    process.exit(1);
  }
  console.log("OK: smoke", p, res.status);
}

const { rowCount } = await pgQuery(
  `delete from client_api_keys where company_id = $1 and name ilike $2`,
  [DEMO, `%${QA_PREFIX}%`],
);
await pgQuery(`delete from client_api_keys where id = $1`, [noScopeId]);
console.log("OK: limpieza QA", rowCount + 1, "key(s)");

console.log("\n✅ verify-api-v1-balance-qa completado");
