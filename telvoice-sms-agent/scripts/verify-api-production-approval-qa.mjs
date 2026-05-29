#!/usr/bin/env node
/**
 * QA aprobación production API Keys (sin habilitar envío real).
 */
import "dotenv/config";
import jwt from "jsonwebtoken";
import pg from "pg";

const BASE = (process.env.PUBLIC_APP_URL || "https://agent.telvoice.cl").replace(/\/$/, "");
const DEMO = process.env.QA_COMPANY_ID || "6cd1db92-d5c7-45e0-8548-df8907843350";
const DEMO_EMAIL = "cliente.demo@telvoice.cl";
const QA_PREFIX = `QA ProdApproval ${Date.now()}`;

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
  return `tv_client_session=${token}`;
}

async function adminCookie() {
  const res = await fetch(`${BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      email: process.env.SUPERADMIN_EMAIL,
      password: process.env.SUPERADMIN_PASSWORD,
    }),
    redirect: "manual",
  });
  const raw =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
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

async function postSms(apiKey, payload) {
  const res = await fetch(`${BASE}/api/v1/sms/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function walletSnapshot() {
  const { rows } = await pgQuery(
    `select available_sms from company_sms_wallets where company_id=$1 and country='CL'`,
    [DEMO],
  );
  const { rows: tx } = await pgQuery(
    `select count(*)::int as c from wallet_transactions wt join company_sms_wallets w on w.id=wt.wallet_id where w.company_id=$1`,
    [DEMO],
  );
  return { available: rows[0]?.available_sms, txCount: tx[0]?.c };
}

const clientCk = await clientCookie();
const adminCk = await adminCookie();
const beforeWallet = await walletSnapshot();

const sandbox = await postPanel("/app/api/keys", clientCk, {
  name: `${QA_PREFIX} sandbox`,
  environment: "sandbox",
  scopes: ["balance:read"],
});
const prod = await postPanel("/app/api/keys", clientCk, {
  name: `${QA_PREFIX} production`,
  environment: "production",
  scopes: ["sms:send", "balance:read"],
});
if (!prod.body.plainTextKey || !prod.body.key?.id) {
  console.error("FAIL create production key", prod);
  process.exit(1);
}
const prodKey = prod.body.plainTextKey;
const prodKeyId = prod.body.key.id;
console.log("OK: production key QA creada");

const appPage = await fetch(`${BASE}/app/api`, { headers: { Cookie: clientCk } });
const appHtml = await appPage.text();
if (!appHtml.includes("Producción pendiente de aprobación")) {
  console.error("FAIL /app/api badge pendiente");
  process.exit(1);
}
if (!appHtml.includes("Producción no habilitada para envío real")) {
  console.error("FAIL /app/api aviso envío real");
  process.exit(1);
}
console.log("OK: /app/api badge pendiente");

const adminPage = await fetch(`${BASE}/admin/api-usage`, { headers: { Cookie: adminCk } });
const adminHtml = await adminPage.text();
if (!adminHtml.includes("Pendiente") || !adminHtml.includes("Aprobar production")) {
  console.error("FAIL admin pendiente");
  process.exit(1);
}
console.log("OK: admin api-usage pendiente");

const approveStatus = await postAdminForm(
  `/admin/api-usage/keys/${prodKeyId}/approve-production`,
  adminCk,
  { notes: QA_PREFIX },
);
if (approveStatus !== 302 && approveStatus !== 303) {
  console.error("FAIL approve HTTP", approveStatus);
  process.exit(1);
}

const { rows: approved } = await pgQuery(
  `select production_approved, production_approved_at, production_approved_by_admin_id, production_approval_notes, metadata
   from client_api_keys where id=$1`,
  [prodKeyId],
);
if (!approved[0]?.production_approved || !approved[0]?.production_approved_at) {
  console.error("FAIL DB approved", approved[0]);
  process.exit(1);
}
const meta = approved[0].metadata ?? {};
if (!Array.isArray(meta.audit_log) || !meta.audit_log.some((e) => e.action === "production_approved")) {
  console.error("FAIL audit_log approve", meta);
  process.exit(1);
}
console.log("OK: aprobación en BD + audit_log");

const appPage2 = await fetch(`${BASE}/app/api`, { headers: { Cookie: clientCk } });
const appHtml2 = await appPage2.text();
if (!appHtml2.includes("Producción aprobada")) {
  console.error("FAIL /app/api badge aprobada");
  process.exit(1);
}
console.log("OK: /app/api badge aprobada");

const send = await postSms(prodKey, {
  to: "+56912345678",
  message: "QA prod approval",
  sender: "Telvoice",
  country: "CL",
  external_reference: `qa-prod-appr-${Date.now()}`,
});
if (send.status !== 403 || send.body.error?.code !== "PRODUCTION_SEND_NOT_ENABLED") {
  console.error("FAIL send production", send);
  process.exit(1);
}
const { rows: logRows } = await pgQuery(
  `select metadata from client_api_requests where request_id=$1`,
  [send.body.request_id],
);
const logMeta = logRows[0]?.metadata ?? {};
if (logMeta.production_approved !== true || logMeta.reason !== "production_send_not_enabled") {
  console.error("FAIL log metadata", logMeta);
  process.exit(1);
}
console.log("OK: send sigue PRODUCTION_SEND_NOT_ENABLED con metadata");

const revokeStatus = await postAdminForm(
  `/admin/api-usage/keys/${prodKeyId}/revoke-production-approval`,
  adminCk,
  { reason: `${QA_PREFIX} revoke` },
);
if (revokeStatus !== 302 && revokeStatus !== 303) {
  console.error("FAIL revoke approval HTTP", revokeStatus);
  process.exit(1);
}
const { rows: revoked } = await pgQuery(
  `select production_approved, metadata from client_api_keys where id=$1`,
  [prodKeyId],
);
if (revoked[0]?.production_approved !== false) {
  console.error("FAIL revoked approval", revoked[0]);
  process.exit(1);
}
console.log("OK: aprobación revocada");

if (sandbox.body.key?.id) {
  const { rows: sb } = await pgQuery(
    `select production_approved from client_api_keys where id=$1`,
    [sandbox.body.key.id],
  );
  if (sb[0]?.production_approved !== false) {
    console.error("FAIL sandbox approval flag");
    process.exit(1);
  }
}

const afterWallet = await walletSnapshot();
if (beforeWallet.available !== afterWallet.available || beforeWallet.txCount !== afterWallet.txCount) {
  console.error("FAIL wallet", beforeWallet, afterWallet);
  process.exit(1);
}
console.log("OK: wallet intacto");

await pgQuery(`delete from client_api_requests where api_key_id=$1`, [prodKeyId]);
await pgQuery(`delete from sms_api_messages where api_key_id=$1`, [prodKeyId]);
await pgQuery(`delete from client_api_keys where id=$1`, [prodKeyId]);
if (sandbox.body.key?.id) {
  await pgQuery(`delete from client_api_keys where id=$1`, [sandbox.body.key.id]);
}
console.log("OK: limpieza QA");

console.log("\n✅ verify-api-production-approval-qa completado");
