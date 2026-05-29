#!/usr/bin/env node
/**
 * QA overrides administrativos de rate limits API.
 */
import "dotenv/config";
import jwt from "jsonwebtoken";
import pg from "pg";

const BASE = (process.env.PUBLIC_APP_URL || "https://agent.telvoice.cl").replace(/\/$/, "");
const DEMO = process.env.QA_COMPANY_ID || "6cd1db92-d5c7-45e0-8548-df8907843350";
const DEMO_EMAIL = "cliente.demo@telvoice.cl";
const CLIENT_COOKIE = "tv_client_session";
const ADMIN_COOKIE = "tv_admin_session";
const QA_PREFIX = `QA RL Override ${Date.now()}`;

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
     join user_profiles up on up.admin_user_id = au.id where lower(au.email)=lower($1)`,
    [DEMO_EMAIL],
  );
  const u = rows[0];
  const token = jwt.sign(
    { sub: u.id, email: u.email, name: u.name, role: u.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h", issuer: "telvoice-sms-agent", audience: "telvoice-admin" },
  );
  return `${CLIENT_COOKIE}=${token}`;
}

async function adminCookie() {
  const email = process.env.SUPERADMIN_EMAIL?.trim();
  const pass = process.env.SUPERADMIN_PASSWORD?.trim();
  if (!email || !pass) throw new Error("SUPERADMIN_* requerido");
  const res = await fetch(`${BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password: pass }),
    redirect: "manual",
  });
  const raw =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean);
  return raw.flatMap((c) => (Array.isArray(c) ? c : [c])).map((c) => c.split(";")[0]).join("; ");
}

async function postPanel(path, cookie, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function postAdminForm(path, cookie, fields) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
    redirect: "manual",
  });
  return res.status;
}

async function getBalance(apiKey) {
  const res = await fetch(`${BASE}/api/v1/balance`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function walletSnapshot(companyId) {
  const { rows } = await pgQuery(
    `select available_sms, reserved_sms from company_sms_wallets where company_id=$1 and country='CL'`,
    [companyId],
  );
  const { rows: tx } = await pgQuery(
    `select count(*)::int as c from wallet_transactions wt join company_sms_wallets w on w.id=wt.wallet_id where w.company_id=$1`,
    [companyId],
  );
  return { available: rows[0]?.available_sms, txCount: tx[0]?.c };
}

async function burstBalance(apiKey, n) {
  let ok = 0;
  let last429 = null;
  for (let i = 0; i < n; i++) {
    const r = await getBalance(apiKey);
    if (r.status === 200) ok++;
    else if (r.status === 429) {
      last429 = r;
      break;
    }
  }
  return { ok, last429 };
}

const cookie = await clientCookie();
const adminCk = await adminCookie();
const beforeWallet = await walletSnapshot(DEMO);

const key1Res = await postPanel("/app/api/keys", cookie, {
  name: `${QA_PREFIX} key1`,
  environment: "sandbox",
  scopes: ["balance:read"],
});
const key2Res = await postPanel("/app/api/keys", cookie, {
  name: `${QA_PREFIX} key2`,
  environment: "sandbox",
  scopes: ["balance:read"],
});
const key1 = key1Res.body.plainTextKey;
const key2 = key2Res.body.plainTextKey;
const key1Id = key1Res.body.key?.id;
const key2Id = key2Res.body.key?.id;
console.log("OK: keys QA creadas");

const defaultBurst = await burstBalance(key1, 35);
if (defaultBurst.ok < 30) {
  console.error("FAIL default limit", defaultBurst);
  process.exit(1);
}
console.log("OK: default ~30/min (ok=", defaultBurst.ok, ")");
console.log("… esperando ventana de 1 min antes de override por key");
await new Promise((r) => setTimeout(r, 65_000));

const createKeyOv = await postAdminForm("/admin/api-usage/rate-limits", adminCk, {
  company_id: DEMO,
  api_key_id: key1Id,
  environment: "sandbox",
  limit_per_minute: "5",
  reason: QA_PREFIX,
});
if (createKeyOv !== 303 && createKeyOv !== 302) {
  console.error("FAIL create key override HTTP", createKeyOv);
  process.exit(1);
}
console.log("OK: override por API Key creado (5/min)");
await new Promise((r) => setTimeout(r, 2_000));

const keyOvBurst = await burstBalance(key1, 8);
if (keyOvBurst.ok !== 5 || keyOvBurst.last429?.body.rate_limit?.limit !== 5) {
  console.error(
    "FAIL key override 5/min",
    keyOvBurst,
    "scope=",
    keyOvBurst.last429?.body.rate_limit?.scope,
  );
  process.exit(1);
}
console.log("OK: 5 permitidos, 6º 429 limit=5");
await new Promise((r) => setTimeout(r, 65_000));

const { rows: ovRows } = await pgQuery(
  `select id from client_api_rate_limit_overrides where company_id=$1 and reason=$2 and status='active' limit 1`,
  [DEMO, QA_PREFIX],
);
const overrideId = ovRows[0]?.id;
if (!overrideId) {
  console.error("FAIL override id");
  process.exit(1);
}

const disableOv = await postAdminForm(
  `/admin/api-usage/rate-limits/${overrideId}/disable`,
  adminCk,
  {},
);
if (disableOv !== 303 && disableOv !== 302) {
  console.error("FAIL disable override", disableOv);
  process.exit(1);
}
await new Promise((r) => setTimeout(r, 65_000));
const afterDisable = await burstBalance(key1, 8);
if (afterDisable.ok < 5) {
  console.error("FAIL tras desactivar override", afterDisable);
  process.exit(1);
}
console.log("OK: tras desactivar vuelve default (~30/min)");

await postAdminForm("/admin/api-usage/rate-limits", adminCk, {
  company_id: DEMO,
  environment: "sandbox",
  limit_per_minute: "7",
  reason: `${QA_PREFIX} company`,
});
await new Promise((r) => setTimeout(r, 65_000));
const companyBurst1 = await burstBalance(key1, 10);
const companyBurst2 = await burstBalance(key2, 10);
if (companyBurst1.ok !== 7 || companyBurst2.ok !== 7) {
  console.error("FAIL company override 7/min", companyBurst1, companyBurst2);
  process.exit(1);
}
console.log("OK: override empresa 7/min en ambas keys");
await new Promise((r) => setTimeout(r, 65_000));

await postAdminForm("/admin/api-usage/rate-limits", adminCk, {
  company_id: DEMO,
  api_key_id: key1Id,
  environment: "sandbox",
  limit_per_minute: "3",
  reason: `${QA_PREFIX} key specific`,
});
await new Promise((r) => setTimeout(r, 65_000));
const k1 = await burstBalance(key1, 6);
const k2 = await burstBalance(key2, 10);
if (k1.ok !== 3 || k1.last429?.body.rate_limit?.limit !== 3) {
  console.error("FAIL key1 3/min", k1);
  process.exit(1);
}
if (k2.ok !== 7) {
  console.error("FAIL key2 mantiene 7/min", k2);
  process.exit(1);
}
console.log("OK: key1=3/min, key2=7/min (prioridad key > empresa)");

const adminPage = await fetch(`${BASE}/admin/api-usage`, { headers: { Cookie: adminCk } });
const adminHtml = await adminPage.text();
if (!adminHtml.includes("Overrides de rate limit") || !adminHtml.includes(QA_PREFIX)) {
  console.error("FAIL admin UI overrides");
  process.exit(1);
}
console.log("OK: /admin/api-usage muestra overrides");

if (k1.last429?.body.request_id) {
  const { rows: logRows } = await pgQuery(
    `select error_code, status_code from client_api_requests where request_id=$1`,
    [k1.last429.body.request_id],
  );
  if (logRows[0]?.error_code !== "RATE_LIMIT_EXCEEDED" || logRows[0]?.status_code !== 429) {
    console.error("FAIL log 429", logRows[0]);
    process.exit(1);
  }
  console.log("OK: log 429 RATE_LIMIT_EXCEEDED");
}

const { rows: msgRows } = await pgQuery(
  `select provider_message_id, dlr_status from sms_api_messages where company_id=$1 and external_reference like $2 limit 5`,
  [DEMO, `%${QA_PREFIX}%`],
);
if (msgRows.some((m) => m.provider_message_id || m.dlr_status)) {
  console.error("FAIL SMS real");
  process.exit(1);
}
console.log("OK: sin SMS real");

const afterWallet = await walletSnapshot(DEMO);
if (beforeWallet.available !== afterWallet.available || beforeWallet.txCount !== afterWallet.txCount) {
  console.error("FAIL wallet", beforeWallet, afterWallet);
  process.exit(1);
}
console.log("OK: wallet intacto");

await pgQuery(`delete from client_api_rate_limit_overrides where reason ilike $1`, [`%${QA_PREFIX}%`]);
await pgQuery(`delete from client_api_requests where api_key_id = any($1::uuid[])`, [[key1Id, key2Id]]);
await pgQuery(`delete from client_api_keys where id = any($1::uuid[])`, [[key1Id, key2Id]]);
console.log("OK: limpieza QA");

console.log("\n✅ verify-api-v1-rate-limit-overrides-qa completado");
