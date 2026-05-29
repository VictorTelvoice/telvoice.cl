#!/usr/bin/env node
/**
 * QA Fase 3.5: idempotencia POST /api/v1/sms/send (sandbox only).
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
const QA_PREFIX = `QA SMS Idem ${Date.now()}`;
const QA_EXT_REF = "qa-idem";
const IDEM_KEY = "qa-idem-001";

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

async function postSms(apiKey, payload, idempotencyKey) {
  const headers = {
    "Content-Type": "application/json",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...(idempotencyKey !== undefined
      ? { "Idempotency-Key": idempotencyKey }
      : {}),
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

const basePayload = {
  to: "+56912345678",
  message: "Mensaje QA idempotencia",
  sender: "Telvoice",
  country: "CL",
  external_reference: QA_EXT_REF,
};

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

const first = await postSms(sandboxKey, basePayload, IDEM_KEY);
if (first.status !== 202 || !first.body.success || !first.body.message?.id) {
  console.error("FAIL primera llamada 202", first);
  process.exit(1);
}
const firstMessageId = first.body.message.id;
console.log("OK: 202 primera llamada", firstMessageId);

const { rows: afterFirst } = await pgQuery(
  `select count(*)::int as c from sms_api_messages
   where api_key_id = $1 and idempotency_key = $2`,
  [sandboxKeyId, IDEM_KEY],
);
if (afterFirst[0]?.c !== 1) {
  console.error("FAIL debe existir 1 mensaje con idempotency_key", afterFirst[0]);
  process.exit(1);
}
console.log("OK: 1 sms_api_messages con idempotency_key");

const { rows: reqFirst } = await pgQuery(
  `select success, status_code, metadata from client_api_requests where request_id = $1`,
  [first.body.request_id],
);
const metaFirst = reqFirst[0]?.metadata ?? {};
if (
  !reqFirst[0] ||
  reqFirst[0].success !== true ||
  reqFirst[0].status_code !== 202 ||
  metaFirst.idempotency_key_present !== true ||
  metaFirst.idempotent_replay !== false
) {
  console.error("FAIL log primera llamada", reqFirst[0]);
  process.exit(1);
}
if (JSON.stringify(metaFirst).includes("Mensaje QA")) {
  console.error("FAIL payload completo en metadata");
  process.exit(1);
}
console.log("OK: log 202 primera llamada");

const replay = await postSms(sandboxKey, basePayload, IDEM_KEY);
if (
  replay.status !== 200 ||
  !replay.body.success ||
  replay.body.idempotent_replay !== true ||
  replay.body.message?.id !== firstMessageId
) {
  console.error("FAIL replay 200", replay);
  process.exit(1);
}
console.log("OK: 200 idempotent_replay mismo message.id");

const { rows: afterReplay } = await pgQuery(
  `select count(*)::int as c from sms_api_messages
   where api_key_id = $1 and idempotency_key = $2`,
  [sandboxKeyId, IDEM_KEY],
);
if (afterReplay[0]?.c !== 1) {
  console.error("FAIL replay creó segundo mensaje", afterReplay[0]);
  process.exit(1);
}

const { rows: reqReplay } = await pgQuery(
  `select success, status_code, metadata from client_api_requests where request_id = $1`,
  [replay.body.request_id],
);
const metaReplay = reqReplay[0]?.metadata ?? {};
if (
  !reqReplay[0] ||
  reqReplay[0].success !== true ||
  reqReplay[0].status_code !== 200 ||
  metaReplay.idempotent_replay !== true
) {
  console.error("FAIL log replay", reqReplay[0]);
  process.exit(1);
}
console.log("OK: log 200 replay");

const conflict = await postSms(
  sandboxKey,
  { ...basePayload, message: "Mensaje distinto QA idempotencia" },
  IDEM_KEY,
);
if (conflict.status !== 409 || conflict.body.error?.code !== "IDEMPOTENCY_CONFLICT") {
  console.error("FAIL conflicto 409", conflict);
  process.exit(1);
}
console.log("OK: 409 IDEMPOTENCY_CONFLICT");

const { rows: reqConflict } = await pgQuery(
  `select success, status_code, error_code, metadata from client_api_requests where request_id = $1`,
  [conflict.body.request_id],
);
if (
  !reqConflict[0] ||
  reqConflict[0].success !== false ||
  reqConflict[0].status_code !== 409 ||
  reqConflict[0].error_code !== "IDEMPOTENCY_CONFLICT"
) {
  console.error("FAIL log conflicto", reqConflict[0]);
  process.exit(1);
}
console.log("OK: log 409 conflicto");

const noKey1 = await postSms(sandboxKey, {
  ...basePayload,
  external_reference: `${QA_EXT_REF}-no-key-1`,
});
const noKey2 = await postSms(sandboxKey, {
  ...basePayload,
  external_reference: `${QA_EXT_REF}-no-key-2`,
});
if (noKey1.status !== 202 || noKey2.status !== 202) {
  console.error("FAIL sin Idempotency-Key", noKey1, noKey2);
  process.exit(1);
}
if (noKey1.body.message?.id === noKey2.body.message?.id) {
  console.error("FAIL sin key no debe deduplicar");
  process.exit(1);
}
console.log("OK: sin Idempotency-Key crea mensajes distintos");

const longKey = "x".repeat(121);
const invalidKey = await postSms(sandboxKey, basePayload, longKey);
if (
  invalidKey.status !== 400 ||
  invalidKey.body.error?.code !== "INVALID_IDEMPOTENCY_KEY"
) {
  console.error("FAIL key demasiado larga", invalidKey);
  process.exit(1);
}
console.log("OK: INVALID_IDEMPOTENCY_KEY");

const emptyKey = await postSms(sandboxKey, basePayload, "   ");
if (
  emptyKey.status !== 400 ||
  emptyKey.body.error?.code !== "INVALID_IDEMPOTENCY_KEY"
) {
  console.error("FAIL key vacía", emptyKey);
  process.exit(1);
}
console.log("OK: key vacía INVALID_IDEMPOTENCY_KEY");

const liveKey = await postPanel("/app/api/keys", cookie, {
  name: `${QA_PREFIX} live`,
  environment: "production",
  scopes: ["sms:send"],
});
const livePlain = liveKey.body.plainTextKey;
const liveId = liveKey.body.key?.id;
const liveFail = await postSms(livePlain, basePayload, "qa-live-idem");
if (liveFail.status !== 403 || liveFail.body.error?.code !== "PRODUCTION_SEND_NOT_ENABLED") {
  console.error("FAIL production key", liveFail);
  process.exit(1);
}
console.log("OK: sandbox only (production → PRODUCTION_SEND_NOT_ENABLED)");

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
if (!html.includes("Idempotency-Key: order-123-send-1")) {
  console.error("FAIL UI curl sin Idempotency-Key");
  process.exit(1);
}
if (
  !html.includes(
    "Usa <code>Idempotency-Key</code> para evitar duplicar mensajes si tu sistema reintenta una solicitud.",
  )
) {
  console.error("FAIL UI nota idempotencia");
  process.exit(1);
}
console.log("OK: UI /app/api documentación idempotencia");

await pgQuery(`delete from client_api_requests where api_key_id = $1`, [sandboxKeyId]);
await pgQuery(`delete from sms_api_messages where api_key_id = $1`, [sandboxKeyId]);
await pgQuery(`delete from sms_api_messages where external_reference like $1`, [
  `${QA_EXT_REF}%`,
]);
await pgQuery(`delete from client_api_keys where id = $1`, [sandboxKeyId]);
await pgQuery(`delete from client_api_keys where id = $1`, [liveId]);
console.log("OK: limpieza QA");

console.log("\n✅ verify-api-v1-sms-idempotency-qa completado");
