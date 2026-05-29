#!/usr/bin/env node
/**
 * QA Fase 1 API Keys: CRUD panel /app/api/keys (sin envío SMS).
 * Requiere DATABASE_URL, JWT_SECRET, API_KEY_PEPPER.
 */
import "dotenv/config";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import pg from "pg";

const BASE = (process.env.PUBLIC_APP_URL || "https://agent.telvoice.cl").replace(
  /\/$/,
  "",
);
const DEMO = process.env.QA_COMPANY_ID || "6cd1db92-d5c7-45e0-8548-df8907843350";
const DEMO_EMAIL = "cliente.demo@telvoice.cl";
const CLIENT_COOKIE = "tv_client_session";
const QA_NAME = `QA API Key ${Date.now()}`;

if (!process.env.API_KEY_PEPPER?.trim()) {
  console.error("FAIL: API_KEY_PEPPER requerido para QA create");
  process.exit(1);
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

async function post(path, cookie, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function get(path, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: cookie },
    redirect: "follow",
  });
  return { status: res.status, html: await res.text() };
}

const cookie = await clientCookie();

const page = await get("/app/api", cookie);
if (page.status !== 200) {
  console.error("FAIL GET /app/api", page.status);
  process.exit(1);
}
console.log("OK: GET /app/api 200");
if (!page.html.includes("API Keys")) {
  console.error("FAIL: sección API Keys no en HTML");
  process.exit(1);
}
console.log("OK: sección API Keys visible");

const created = await post("/app/api/keys", cookie, {
  name: QA_NAME,
  environment: "sandbox",
  scopes: ["balance:read", "messages:read"],
});
if (created.status !== 200 || !created.body.ok || !created.body.plainTextKey) {
  console.error("FAIL create key", created);
  process.exit(1);
}
const plainKey = created.body.plainTextKey;
const keyId = created.body.key?.id;
console.log("OK: create key", plainKey.slice(0, 16) + "...");

const reload = await get("/app/api", cookie);
if (reload.html.includes(plainKey)) {
  console.error("FAIL: key completa en HTML tras reload");
  process.exit(1);
}
if (!reload.html.includes(created.body.key?.keyMasked || "tlv_test_")) {
  console.error("FAIL: key enmascarada no en HTML");
  process.exit(1);
}
console.log("OK: solo key enmascarada en HTML");

const { rows: dbRows } = await pgQuery(
  `select key_hash, key_masked, key_prefix from client_api_keys where id = $1`,
  [keyId],
);
if (!dbRows[0]?.key_hash) {
  console.error("FAIL: key_hash no en BD");
  process.exit(1);
}
const pepper = process.env.API_KEY_PEPPER.trim();
const expectedHash = crypto
  .createHmac("sha256", pepper)
  .update(plainKey.trim())
  .digest("hex");
if (dbRows[0].key_hash !== expectedHash) {
  console.error("FAIL: key_hash no coincide con HMAC");
  process.exit(1);
}
const { rows: plainLeak } = await pgQuery(
  `select id from client_api_keys where id = $1 and (
    name = $2 or key_masked = $3 or key_prefix = $4
  )`,
  [keyId, plainKey, plainKey, plainKey],
);
if (plainLeak.length) {
  console.error("FAIL: posible texto plano en columnas");
  process.exit(1);
}
console.log("OK: hash en BD, sin texto plano");

const paused = await post(`/app/api/keys/${keyId}/pause`, cookie, {});
if (paused.status !== 200 || paused.body.key?.status !== "paused") {
  console.error("FAIL pause", paused);
  process.exit(1);
}
console.log("OK: pause");

const activated = await post(`/app/api/keys/${keyId}/activate`, cookie, {});
if (activated.status !== 200 || activated.body.key?.status !== "active") {
  console.error("FAIL activate", activated);
  process.exit(1);
}
console.log("OK: activate");

const scoped = await post(`/app/api/keys/${keyId}/scopes`, cookie, {
  scopes: ["balance:read", "sms:send"],
});
if (scoped.status !== 200 || !scoped.body.key?.scopes?.includes("sms:send")) {
  console.error("FAIL scopes", scoped);
  process.exit(1);
}
console.log("OK: scopes");

const renamed = await post(`/app/api/keys/${keyId}/name`, cookie, {
  name: QA_NAME + " renamed",
});
if (renamed.status !== 200) {
  console.error("FAIL rename", renamed);
  process.exit(1);
}
console.log("OK: rename");

const revoked = await post(`/app/api/keys/${keyId}/revoke`, cookie, {
  reason: "QA cleanup",
});
if (revoked.status !== 200 || revoked.body.key?.status !== "revoked") {
  console.error("FAIL revoke", revoked);
  process.exit(1);
}
console.log("OK: revoke");

const reactivate = await post(`/app/api/keys/${keyId}/activate`, cookie, {});
if (reactivate.status === 200 && reactivate.body.ok) {
  console.error("FAIL: revoked key reactivated");
  process.exit(1);
}
console.log("OK: revoked no reactiva");

const smsRoute = await fetch(`${BASE}/api/v1/sms/send`, { method: "POST" });
if (smsRoute.status !== 404 && smsRoute.status !== 401 && smsRoute.status !== 403) {
  console.warn("WARN: /api/v1/sms/send status", smsRoute.status);
} else {
  console.log("OK: no /api/v1/sms/send público");
}

const smokePaths = [
  "/app/api",
  "/app/support",
  "/app/templates",
  "/app/settings",
  "/app/buy-sms",
  "/app/orders",
  "/app/wallet",
  "/app/invoices",
  "/admin/support",
];
for (const p of smokePaths) {
  const r = await get(p, cookie);
  if (r.status !== 200) {
    console.error("FAIL smoke", p, r.status);
    process.exit(1);
  }
  console.log("OK: smoke", p);
}

const { rowCount } = await pgQuery(
  `delete from client_api_keys where company_id = $1 and name ilike '%QA%'`,
  [DEMO],
);
console.log("OK: limpieza QA", rowCount, "fila(s)");

console.log("\n✅ verify-client-api-keys-qa completado");
