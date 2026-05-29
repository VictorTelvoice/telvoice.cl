#!/usr/bin/env node
/**
 * QA HTTP producción: /app/api (demo, sin API real).
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
const QA_WEBHOOK = "https://telvoice.cl/qa-api-webhook";

async function clientCookie() {
  const conn = process.env.DATABASE_URL?.trim();
  const client = new pg.Client({
    connectionString: conn,
    ssl: conn?.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  const { rows } = await client.query(
    `select au.id, au.email, au.name, up.role from admin_users au
     join user_profiles up on up.admin_user_id = au.id
     where lower(au.email) = lower($1)`,
    [DEMO_EMAIL],
  );
  await client.end();
  const u = rows[0];
  if (!u) throw new Error("Usuario demo no encontrado");
  const token = jwt.sign(
    { sub: u.id, email: u.email, name: u.name, role: u.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h", issuer: "telvoice-sms-agent", audience: "telvoice-admin" },
  );
  return `${CLIENT_COOKIE}=${token}`;
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
let r = await get("/app/api", cookie);
if (r.status !== 200) {
  console.error("FAIL GET /app/api", r.status);
  process.exit(1);
}
console.log("OK: GET /app/api 200");
if (!r.html.includes("DB_AVAILABLE = true")) {
  console.error("FAIL: DB_AVAILABLE no true");
  process.exit(1);
}
console.log("OK: DB_AVAILABLE");

let regen = await post("/app/api/key/regenerate", cookie, {});
if (regen.status !== 200 || !regen.body.ok) {
  console.error("FAIL regenerate", regen);
  process.exit(1);
}
const key = regen.body.settings?.apiKeyDemo;
console.log("OK: regenerate", key?.slice(0, 20));

r = await get("/app/api", cookie);
if (!r.html.includes(key)) {
  console.error("FAIL: key no en HTML tras reload");
  process.exit(1);
}
console.log("OK: persistencia key");

const wh = await post("/app/api/webhook", cookie, {
  webhookUrl: QA_WEBHOOK,
  events: ["delivered", "failed", "expired", "rejected"],
});
if (wh.status !== 200 || !wh.body.ok) {
  console.error("FAIL webhook", wh);
  process.exit(1);
}
console.log("OK: webhook save");

r = await get("/app/api", cookie);
if (!r.html.includes(QA_WEBHOOK)) {
  console.error("FAIL webhook no en HTML");
  process.exit(1);
}
console.log("OK: persistencia webhook");

const test = await post("/app/api/webhook/test", cookie, {});
if (test.status !== 200 || !test.body.ok) {
  console.error("FAIL webhook test", test);
  process.exit(1);
}
console.log("OK: webhook test");

const bad = await post("/app/api/webhook", cookie, {
  webhookUrl: "not valid url!!!",
  events: ["delivered"],
});
if (bad.status !== 400) {
  console.error("FAIL validación URL", bad.status);
  process.exit(1);
}
console.log("OK: validación URL");

const smpp = await post("/app/api/smpp/request", cookie, {});
if (smpp.status !== 200 || !smpp.body.ok) {
  console.error("FAIL smpp", smpp);
  process.exit(1);
}
console.log("OK: smpp request");

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
const { rowCount } = await client.query(
  `delete from client_api_settings where company_id = $1`,
  [DEMO],
);
await client.end();
console.log("OK: limpieza demo", rowCount, "fila(s)");

console.log("\n✅ verify-app-api-prod-qa completado");
