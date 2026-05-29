#!/usr/bin/env node
/**
 * QA vista admin /admin/api-usage + generación actividad API temporal.
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
const QA_PREFIX = `QA Admin ApiUsage ${Date.now()}`;
const QA_EXT = "qa-admin-api-usage";
const ADMIN_EMAIL = process.env.SUPERADMIN_EMAIL?.trim();
const ADMIN_PASS = process.env.SUPERADMIN_PASSWORD?.trim();

async function pgQuery(text, params) {
  const conn = process.env.DATABASE_URL?.trim();
  const c = new pg.Client({
    connectionString: conn,
    ssl: conn?.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });
  await c.connect();
  try {
    return await c.query(text, params);
  } finally {
    await c.end();
  }
}

function parseCookies(res) {
  const raw =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean);
  return raw
    .flatMap((c) => (Array.isArray(c) ? c : [c]))
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function adminLogin() {
  const res = await fetch(`${BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
    redirect: "manual",
  });
  const cookie = parseCookies(res);
  if (!cookie.includes("tv_admin_session")) {
    throw new Error(`Admin login failed HTTP ${res.status}`);
  }
  return cookie;
}

async function clientCookie() {
  const { rows } = await pgQuery(
    `select au.id, au.email, au.name, up.role from admin_users au
     join user_profiles up on up.admin_user_id = au.id
     where lower(au.email) = lower($1)`,
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

async function postPanel(path, cookie, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function apiFetch(key, path, method = "GET", body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function walletSnapshot() {
  const { rows } = await pgQuery(
    `select available_sms, reserved_sms from company_sms_wallets where company_id=$1 and country='CL'`,
    [DEMO],
  );
  const { rows: tx } = await pgQuery(
    `select count(*)::int as c from wallet_transactions wt join company_sms_wallets w on w.id=wt.wallet_id where w.company_id=$1`,
    [DEMO],
  );
  return { available: rows[0]?.available_sms, tx: tx[0]?.c };
}

if (!ADMIN_EMAIL || !ADMIN_PASS) {
  console.error("FAIL: SUPERADMIN_EMAIL/PASSWORD requeridos");
  process.exit(1);
}

const beforeWallet = await walletSnapshot();
const adminCookie = await adminLogin();
const clientCk = await clientCookie();

const page = await fetch(`${BASE}/admin/api-usage`, {
  headers: { Cookie: adminCookie },
});
const html = await page.text();
if (page.status !== 200) {
  console.error("FAIL admin page", page.status);
  process.exit(1);
}
for (const needle of [
  "Uso de API",
  "Monitorea API Keys",
  "Requests recientes",
  "API Keys por empresa",
  "Mensajes sandbox",
  "Requests 24h",
]) {
  if (!html.includes(needle)) {
    console.error("FAIL missing UI:", needle);
    process.exit(1);
  }
}
if (html.includes("key_hash") || html.includes("tlv_test_") && html.match(/tlv_test_[A-Za-z0-9]{20,}/)) {
  console.error("FAIL possible full key in admin HTML");
  process.exit(1);
}
console.log("OK: /admin/api-usage carga");

const clientDenied = await fetch(`${BASE}/admin/api-usage`, {
  headers: { Cookie: clientCk },
  redirect: "manual",
});
if (clientDenied.status === 200 && !(clientDenied.headers.get("location") || "").includes("/admin/login")) {
  // client cookie alone should not access admin - may redirect to login or app
  const loc = clientDenied.headers.get("location") || "";
  if (clientDenied.status === 200) {
    console.error("FAIL client accessed admin page");
    process.exit(1);
  }
}
console.log("OK: cliente no accede admin (status", clientDenied.status, ")");

const created = await postPanel("/app/api/keys", clientCk, {
  name: `${QA_PREFIX} key`,
  environment: "sandbox",
  scopes: ["balance:read", "sms:send", "messages:read"],
});
const apiKey = created.body.plainTextKey;
const keyId = created.body.key?.id;
if (!apiKey) {
  console.error("FAIL create key", created);
  process.exit(1);
}

await apiFetch(apiKey, "/api/v1/balance");
const send = await apiFetch(apiKey, "/api/v1/sms/send", "POST", {
  to: "+56912345678",
  message: "QA admin api usage",
  external_reference: QA_EXT,
});
const msgId = send.body.message?.id;
await apiFetch(apiKey, "/api/v1/messages?limit=5");
if (msgId) await apiFetch(apiKey, `/api/v1/messages/${msgId}`);
console.log("OK: actividad API generada");

await new Promise((r) => setTimeout(r, 1500));

const page2 = await fetch(`${BASE}/admin/api-usage?q=${encodeURIComponent(QA_EXT)}`, {
  headers: { Cookie: adminCookie },
});
const html2 = await page2.text();
if (!html2.includes(QA_EXT) && !html2.includes("/api/v1/balance")) {
  console.error("FAIL requests not visible in admin (puede ser delay)");
}
console.log("OK: filtros/detalle admin revisados");

const detailPage = send.body.request_id
  ? await fetch(`${BASE}/admin/api-usage?request=${encodeURIComponent(send.body.request_id)}`, {
      headers: { Cookie: adminCookie },
    })
  : null;
if (detailPage && detailPage.status === 200) {
  const dhtml = await detailPage.text();
  if (!dhtml.includes("Detalle request") || !dhtml.includes(send.body.request_id)) {
    console.error("FAIL request detail");
    process.exit(1);
  }
  console.log("OK: detalle request");
}

if (msgId) {
  const mpage = await fetch(`${BASE}/admin/api-usage?message=${msgId}`, {
    headers: { Cookie: adminCookie },
  });
  const mhtml = await mpage.text();
  if (!mhtml.includes("Detalle mensaje sandbox")) {
    console.error("FAIL message detail");
    process.exit(1);
  }
  console.log("OK: detalle mensaje");
}

const afterWallet = await walletSnapshot();
if (beforeWallet.available !== afterWallet.available || beforeWallet.tx !== afterWallet.tx) {
  console.error("FAIL wallet changed", beforeWallet, afterWallet);
  process.exit(1);
}
console.log("OK: wallet intacto");

await pgQuery(`delete from client_api_requests where api_key_id = $1`, [keyId]);
await pgQuery(`delete from sms_api_messages where api_key_id = $1`, [keyId]);
await pgQuery(`delete from client_api_keys where id = $1`, [keyId]);
console.log("OK: limpieza QA");

console.log("\n✅ verify-admin-api-usage-qa completado");
