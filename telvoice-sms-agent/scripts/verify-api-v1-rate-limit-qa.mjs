#!/usr/bin/env node
/**
 * QA rate limits /api/v1 (sandbox: 30/min por API Key, 500/día por empresa).
 * Requiere: DATABASE_URL, JWT_SECRET, API_KEY_PEPPER, PUBLIC_APP_URL.
 * Opcional: SUPERADMIN_* para smoke /admin/api-usage.
 * Límite diario bajo: configurar API_RATE_LIMIT_SANDBOX_DAY en el servidor (p. ej. 3).
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
const ADMIN_COOKIE = "tv_admin_session";
const QA_PREFIX = `QA RateLimit ${Date.now()}`;
const SANDBOX_MINUTE = Number.parseInt(
  process.env.API_RATE_LIMIT_SANDBOX_MINUTE || "30",
  10,
);
const SANDBOX_DAY = Number.parseInt(
  process.env.API_RATE_LIMIT_SANDBOX_DAY || "500",
  10,
);
const BURST = SANDBOX_MINUTE + 2;

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

async function adminCookie() {
  const email = process.env.SUPERADMIN_EMAIL?.trim();
  const pass = process.env.SUPERADMIN_PASSWORD?.trim();
  if (!email || !pass) return null;
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
  const line = raw
    .flatMap((c) => (Array.isArray(c) ? c : [c]))
    .map((c) => c.split(";")[0])
    .find((c) => c.startsWith(`${ADMIN_COOKIE}=`));
  if (!line) throw new Error(`Admin login failed HTTP ${res.status}`);
  return line;
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
  return {
    status: res.status,
    body,
    headers: {
      limit: res.headers.get("x-ratelimit-limit"),
      remaining: res.headers.get("x-ratelimit-remaining"),
      reset: res.headers.get("x-ratelimit-reset"),
      retryAfter: res.headers.get("retry-after"),
    },
  };
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
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, headers: res.headers };
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

async function countCompanyDay(companyId) {
  const { rows } = await pgQuery(
    `select count(*)::int as c from client_api_requests
     where company_id = $1
       and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')
       and (error_code is null or error_code <> 'RATE_LIMIT_EXCEEDED')`,
    [companyId],
  );
  return rows[0]?.c ?? 0;
}

const cookie = await clientCookie();
const beforeWallet = await walletSnapshot(DEMO);

const created = await postPanel("/app/api/keys", cookie, {
  name: `${QA_PREFIX} burst`,
  environment: "sandbox",
  scopes: ["balance:read", "sms:send", "messages:read"],
});
if (created.status !== 200 || !created.body.plainTextKey) {
  console.error("FAIL create key", created);
  process.exit(1);
}
const apiKey = created.body.plainTextKey;
const keyId = created.body.key?.id;
console.log("OK: API Key QA sandbox creada");

let okCount = 0;
let first429 = null;
for (let i = 0; i < BURST; i++) {
  const r = await getBalance(apiKey);
  if (r.status === 200 && r.body.success) {
    okCount++;
    continue;
  }
  if (r.status === 429 && !first429) {
    first429 = r;
    continue;
  }
  if (r.status === 429) continue;
  console.error("FAIL burst inesperado", i + 1, r);
  process.exit(1);
}

if (okCount < SANDBOX_MINUTE) {
  console.error("FAIL: se esperaban al menos", SANDBOX_MINUTE, "x 200, obtuvo", okCount);
  process.exit(1);
}
if (!first429 || first429.status !== 429) {
  console.error("FAIL: no hubo 429 tras superar límite por minuto");
  process.exit(1);
}
if (first429.body.error?.code !== "RATE_LIMIT_EXCEEDED") {
  console.error("FAIL: código error 429", first429.body);
  process.exit(1);
}
if (!first429.body.request_id?.startsWith("req_")) {
  console.error("FAIL: request_id en 429", first429.body);
  process.exit(1);
}
if (
  !first429.body.rate_limit?.scope ||
  typeof first429.body.rate_limit.limit !== "number" ||
  typeof first429.body.rate_limit.retry_after_seconds !== "number"
) {
  console.error("FAIL: rate_limit body", first429.body);
  process.exit(1);
}
console.log("OK: burst", okCount, "x 200 luego 429", first429.body.rate_limit.scope);

const { rows: logRows } = await pgQuery(
  `select status_code, success, error_code, metadata
   from client_api_requests where request_id = $1 limit 1`,
  [first429.body.request_id],
);
const log = logRows[0];
if (!log || log.status_code !== 429 || log.success !== false || log.error_code !== "RATE_LIMIT_EXCEEDED") {
  console.error("FAIL: log 429", log);
  process.exit(1);
}
const meta = log.metadata ?? {};
if (!meta.rate_limit_scope || meta.limit == null || meta.retry_after_seconds == null) {
  console.error("FAIL: metadata rate limit", meta);
  process.exit(1);
}
console.log("OK: log RATE_LIMIT_EXCEEDED en client_api_requests");

const spam429 = await getBalance(apiKey);
if (spam429.status !== 429) {
  console.error("FAIL: segundo 429 esperado", spam429.status);
  process.exit(1);
}
const dayBeforeSpam = await countCompanyDay(DEMO);
await getBalance(apiKey);
const dayAfterSpam = await countCompanyDay(DEMO);
if (dayAfterSpam > dayBeforeSpam + 1) {
  console.error(
    "FAIL: 429 repetidos incrementaron conteo diario",
    dayBeforeSpam,
    dayAfterSpam,
  );
  process.exit(1);
}
console.log("OK: 429 repetidos no inflan conteo diario");

const retryAfter = first429.body.rate_limit.retry_after_seconds;
await new Promise((r) => setTimeout(r, (retryAfter + 2) * 1000));
const afterWait = await getBalance(apiKey);
if (afterWait.status !== 200) {
  console.error("FAIL: tras ventana no permitió request", afterWait);
  process.exit(1);
}
console.log("OK: tras retry_after vuelve 200");

let sms429 = false;
for (let i = 0; i < SANDBOX_MINUTE + 2; i++) {
  const r = await postSms(apiKey, {
    to: "+56912345678",
    message: `QA rate ${i}`,
    sender: "Telvoice",
    country: "CL",
    external_reference: `qa-rate-sms-${Date.now()}-${i}`,
  });
  if (r.status === 429 && r.body.error?.code === "RATE_LIMIT_EXCEEDED") {
    sms429 = true;
    break;
  }
}
if (!sms429) {
  console.error("FAIL: POST /api/v1/sms/send no devolvió 429 tras burst");
  process.exit(1);
}
console.log("OK: POST /api/v1/sms/send respeta rate limit");

const { rows: msgRows } = await pgQuery(
  `select provider_message_id, dlr_status from sms_messages
   where company_id = $1 and external_reference like 'qa-rate%'
   order by created_at desc limit 5`,
  [DEMO],
);
for (const m of msgRows) {
  if (m.provider_message_id != null || m.dlr_status != null) {
    console.error("FAIL: SMS real detectado", m);
    process.exit(1);
  }
}
console.log("OK: sin SMS real (provider_message_id/dlr null)");

const afterWallet = await walletSnapshot(DEMO);
if (
  beforeWallet.available !== afterWallet.available ||
  beforeWallet.reserved !== afterWallet.reserved ||
  beforeWallet.txCount !== afterWallet.txCount
) {
  console.error("FAIL: wallet modificado", { beforeWallet, afterWallet });
  process.exit(1);
}
console.log("OK: wallet intacto");

const dayCount = await countCompanyDay(DEMO);
if (SANDBOX_DAY <= 10 && dayCount >= SANDBOX_DAY - 1) {
  const nearLimit = await getBalance(apiKey);
  if (nearLimit.status === 429 && nearLimit.body.rate_limit?.scope === "company_day") {
    console.log("OK: límite diario company_day (servidor con DAY bajo)");
  } else {
    console.log(
      "INFO: límite diario no disparado (dayCount",
      dayCount,
      "limit",
      SANDBOX_DAY,
      ")",
    );
  }
} else {
  console.log(
    "INFO: límite diario omitido en prod (configurar API_RATE_LIMIT_SANDBOX_DAY<=10 en servidor para QA D)",
  );
}

const adminCk = await adminCookie().catch(() => null);
if (adminCk) {
  const page = await fetch(`${BASE}/admin/api-usage?error=RATE_LIMIT_EXCEEDED`, {
    headers: { Cookie: adminCk },
    redirect: "manual",
  });
  const html = await page.text();
  if (page.status !== 200 || !html.includes("RATE_LIMIT_EXCEEDED")) {
    console.error("FAIL: admin api-usage sin RATE_LIMIT_EXCEEDED", page.status);
    process.exit(1);
  }
  if (!html.includes("429")) {
    console.error("FAIL: admin api-usage sin 429");
    process.exit(1);
  }
  console.log("OK: /admin/api-usage muestra 429 y RATE_LIMIT_EXCEEDED");
} else {
  console.log("INFO: SUPERADMIN_* omitido — smoke admin api-usage no ejecutado");
}

await pgQuery(
  `delete from client_api_requests where api_key_id = $1`,
  [keyId],
);
await pgQuery(
  `delete from sms_messages where company_id = $1 and external_reference like 'qa-rate%'`,
  [DEMO],
);
await pgQuery(`delete from client_api_keys where id = $1`, [keyId]);
console.log("OK: limpieza QA (key, logs, messages)");

console.log("\n✅ verify-api-v1-rate-limit-qa completado");
