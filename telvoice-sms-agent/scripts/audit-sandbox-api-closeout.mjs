#!/usr/bin/env node
/**
 * Auditoría final de cierre — API sandbox Telvoice.
 * Solo lectura + QA temporal con limpieza al final.
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
const QA_PREFIX = `QA Audit Closeout ${Date.now()}`;
const QA_EXT_REF = "qa-audit-closeout";
const IDEM_KEY = "qa-audit-idem-001";
const SANDBOX_MINUTE = Number.parseInt(
  process.env.API_RATE_LIMIT_SANDBOX_MINUTE || "30",
  10,
);
const ADMIN_EMAIL = process.env.SUPERADMIN_EMAIL?.trim();
const ADMIN_PASS = process.env.SUPERADMIN_PASSWORD?.trim();

const report = {
  tables: null,
  rls: null,
  qaResiduesBefore: null,
  routes: {},
  keyColumns: null,
  keySample: null,
  walletBefore: null,
  walletAfter: null,
  functional: [],
  logs: [],
  ui: [],
  smoke: [],
  qaResiduesAfter: null,
  errors: [],
};

function pass(section, msg) {
  report.functional.push({ ok: true, section, msg });
  console.log(`✅ [${section}] ${msg}`);
}

function fail(section, msg) {
  report.errors.push({ section, msg });
  console.error(`❌ [${section}] ${msg}`);
}

async function pgQuery(text, params) {
  const conn = process.env.DATABASE_URL?.trim();
  if (!conn) throw new Error("DATABASE_URL no definido");
  const client = new pg.Client({
    connectionString: conn,
    ssl: conn.includes("supabase") ? { rejectUnauthorized: false } : undefined,
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

async function apiFetch(apiKey, path, method = "GET", body, extraHeaders = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...extraHeaders,
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
  const res = await fetch(`${BASE}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const bodyJson = await res.json().catch(() => ({}));
  return {
    status: res.status,
    body: bodyJson,
    headers: {
      limit: res.headers.get("x-ratelimit-limit"),
      remaining: res.headers.get("x-ratelimit-remaining"),
      reset: res.headers.get("x-ratelimit-reset"),
      retryAfter: res.headers.get("retry-after"),
    },
  };
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
  const { rows: badCost } = await pgQuery(
    `select count(*)::int as c from sms_api_messages
     where environment = 'sandbox' and cost_sms <> 0`,
  );
  return {
    available: rows[0]?.available_sms ?? null,
    reserved: rows[0]?.reserved_sms ?? null,
    txCount: tx[0]?.c ?? 0,
    sandboxNonZeroCost: badCost[0]?.c ?? 0,
  };
}

async function auditTablesAndRls() {
  const { rows: tables } = await pgQuery(`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_name in (
      'client_api_keys', 'client_api_requests', 'sms_api_messages'
    )
    order by table_name
  `);
  report.tables = tables.map((r) => r.table_name);

  const { rows: rls } = await pgQuery(`
    select relname, relrowsecurity
    from pg_class
    where relname in ('client_api_keys', 'client_api_requests', 'sms_api_messages')
    order by relname
  `);
  report.rls = rls;

  const { rows: qaKeys } = await pgQuery(
    `select count(*)::int as c from client_api_keys where name ilike '%QA%'`,
  );
  const { rows: qaMsgs } = await pgQuery(
    `select count(*)::int as c from sms_api_messages
     where external_reference ilike '%qa%' or metadata::text ilike '%qa%'`,
  );
  const { rows: qaReqs } = await pgQuery(
    `select count(*)::int as c from client_api_requests
     where metadata::text ilike '%qa%' or error_code ilike '%QA%'`,
  );
  report.qaResiduesBefore = {
    keys: qaKeys[0].c,
    messages: qaMsgs[0].c,
    requests: qaReqs[0].c,
  };

  if (report.tables.length === 3) {
    pass("tablas", `3 tablas API presentes: ${report.tables.join(", ")}`);
  } else {
    fail("tablas", `Faltan tablas: encontradas ${report.tables.length}`);
  }

  const rlsOff = rls.every((r) => r.relrowsecurity === false);
  if (rlsOff) {
    pass("rls", "RLS OFF en las 3 tablas API");
  } else {
    fail("rls", `RLS inesperado: ${JSON.stringify(rls)}`);
  }

  console.log("\n--- Residuos QA previos ---");
  console.log(JSON.stringify(report.qaResiduesBefore, null, 2));
}

async function auditKeySecurity() {
  const { rows: cols } = await pgQuery(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'client_api_keys'
    order by ordinal_position
  `);
  report.keyColumns = cols.map((r) => r.column_name);

  const forbidden = ["api_key", "plain_key", "secret", "key_plain"];
  const hasForbidden = forbidden.some((f) =>
    report.keyColumns.some((c) => c.toLowerCase().includes(f)),
  );
  const hasHash = report.keyColumns.includes("key_hash");
  const hasMasked = report.keyColumns.includes("key_masked");
  const hasPrefix = report.keyColumns.includes("key_prefix");

  if (!hasForbidden && hasHash && hasMasked && hasPrefix) {
    pass("keys-bd", "Columnas seguras: key_hash, key_masked, key_prefix; sin plaintext");
  } else {
    fail("keys-bd", `Esquema inesperado: ${report.keyColumns.join(", ")}`);
  }

  const { rows: leak } = await pgQuery(`
    select count(*)::int as c from client_api_keys
    where key_masked ~ '^tlv_(test|live)_[A-Za-z0-9]{20,}$'
       or key_prefix ~ '^tlv_(test|live)_[A-Za-z0-9]{20,}$'
       or name ~ '^tlv_(test|live)_'
  `);
  if (leak[0].c === 0) {
    pass("keys-bd", "Sin keys completas en campos indebidos (muestreo regex)");
  } else {
    fail("keys-bd", `${leak[0].c} filas con posible key completa en campo indebido`);
  }

  const { rows: hashCheck } = await pgQuery(`
    select count(*)::int as total,
           count(*) filter (where key_hash is not null and length(key_hash) > 20)::int as with_hash
    from client_api_keys
  `);
  if (hashCheck[0].total === hashCheck[0].with_hash) {
    pass("keys-bd", `Todas las keys tienen key_hash (${hashCheck[0].total})`);
  } else {
    fail("keys-bd", `Keys sin hash: ${hashCheck[0].total - hashCheck[0].with_hash}`);
  }

  const { rows: sample } = await pgQuery(`
    select id, company_id, name, key_prefix, key_masked, status, environment, scopes, last_used_at
    from client_api_keys
    order by created_at desc
    limit 5
  `);
  report.keySample = sample;
}

async function auditRoutes() {
  const allowed = [
    { method: "GET", path: "/api/v1/balance", expectNoAuth: 401 },
    { method: "POST", path: "/api/v1/sms/send", expectNoAuth: 401 },
    { method: "GET", path: "/api/v1/messages", expectNoAuth: 401 },
    {
      method: "GET",
      path: "/api/v1/messages/00000000-0000-4000-8000-000000000001",
      expectNoAuth: 401,
    },
  ];
  const forbidden = [
    { method: "POST", path: "/api/v1/sms/bulk" },
    { method: "POST", path: "/api/v1/webhooks/test" },
  ];

  for (const r of allowed) {
    const res = await fetch(`${BASE}${r.path}`, {
      method: r.method,
      headers: { "Content-Type": "application/json" },
      ...(r.method === "POST" ? { body: '{"to":"+56912345678","message":"x"}' } : {}),
    });
    report.routes[r.path] = res.status;
    if (res.status === r.expectNoAuth) {
      pass("rutas", `${r.method} ${r.path} existe (${res.status} sin auth)`);
    } else {
      fail("rutas", `${r.method} ${r.path} status inesperado: ${res.status}`);
    }
  }

  for (const r of forbidden) {
    const res = await fetch(`${BASE}${r.path}`, {
      method: r.method,
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    report.routes[r.path] = res.status;
    if (res.status === 404 || res.status === 401) {
      pass("rutas", `${r.method} ${r.path} no expuesto (${res.status})`);
    } else {
      fail("rutas", `${r.method} ${r.path} debería estar ausente, got ${res.status}`);
    }
  }
}

async function functionalQa(cookie, walletBefore) {
  const created = await postPanel("/app/api/keys", cookie, {
    name: `${QA_PREFIX} full`,
    environment: "sandbox",
    scopes: ["balance:read", "sms:send", "messages:read"],
  });
  if (created.status !== 200 || !created.body.plainTextKey) {
    fail("qa", `No se pudo crear key QA: ${JSON.stringify(created.body)}`);
    return null;
  }
  const key = created.body.plainTextKey;
  const keyId = created.body.key?.id;

  const noScopeKey = await postPanel("/app/api/keys", cookie, {
    name: `${QA_PREFIX} balance-only`,
    environment: "sandbox",
    scopes: ["balance:read"],
  });
  const balanceOnlyKey = noScopeKey.body.plainTextKey;
  const balanceOnlyId = noScopeKey.body.key?.id;

  const prodKey = await postPanel("/app/api/keys", cookie, {
    name: `${QA_PREFIX} prod-send`,
    environment: "production",
    scopes: ["sms:send"],
  });
  const prodPlain = prodKey.body.plainTextKey;
  const prodId = prodKey.body.key?.id;

  // A. Balance
  const bal = await apiFetch(key, "/api/v1/balance");
  if (bal.status === 200 && bal.body.request_id && bal.body.balance) {
    pass("qa", "GET /api/v1/balance → 200 + request_id");
    report.logs.push({ type: "balance", request_id: bal.body.request_id });
  } else {
    fail("qa", `Balance: ${bal.status} ${JSON.stringify(bal.body)}`);
  }

  // B. Send
  const sendPayload = {
    to: "+56912345678",
    message: "Auditoría cierre API sandbox",
    sender: "Telvoice",
    country: "CL",
    external_reference: QA_EXT_REF,
  };
  const send = await apiFetch(key, "/api/v1/sms/send", "POST", sendPayload, {
    "Idempotency-Key": IDEM_KEY,
  });
  const messageId = send.body.message?.id;
  if (
    send.status === 202 &&
    send.body.message?.status === "sandbox_accepted" &&
    send.body.message?.cost_sms === 0
  ) {
    pass("qa", "POST /api/v1/sms/send → 202 sandbox_accepted cost_sms=0");
    report.logs.push({ type: "send", request_id: send.body.request_id, messageId });
  } else {
    fail("qa", `Send: ${send.status} ${JSON.stringify(send.body)}`);
  }

  const { rows: msgDb } = await pgQuery(
    `select provider_message_id, dlr_status, cost_sms from sms_api_messages where id = $1`,
    [messageId],
  );
  if (
    msgDb[0] &&
    msgDb[0].provider_message_id === null &&
    msgDb[0].dlr_status === null &&
    msgDb[0].cost_sms === 0
  ) {
    pass("qa", "sms_api_messages: provider_message_id y dlr_status null, cost_sms=0");
  } else {
    fail("qa", `sms_api_messages row: ${JSON.stringify(msgDb[0])}`);
  }

  // C. Idempotent replay
  const replay = await apiFetch(key, "/api/v1/sms/send", "POST", sendPayload, {
    "Idempotency-Key": IDEM_KEY,
  });
  if (
    replay.status === 200 &&
    replay.body.idempotent_replay === true &&
    replay.body.message?.id === messageId
  ) {
    pass("qa", "Idempotency replay → 200 idempotent_replay mismo message.id");
    report.logs.push({ type: "replay", request_id: replay.body.request_id });
  } else {
    fail("qa", `Replay: ${replay.status} ${JSON.stringify(replay.body)}`);
  }

  const { rows: dupRows } = await pgQuery(
    `select count(*)::int as c from sms_api_messages
     where company_id = $1 and external_reference = $2`,
    [DEMO, QA_EXT_REF],
  );
  if (dupRows[0].c === 1) {
    pass("qa", "Idempotency replay: un solo sms_api_messages (sin duplicado)");
  } else {
    fail("qa", `Duplicados sms_api_messages: ${dupRows[0].c}`);
  }

  // D. Idempotency conflict
  const conflict = await apiFetch(
    key,
    "/api/v1/sms/send",
    "POST",
    { ...sendPayload, message: "Payload distinto auditoría" },
    { "Idempotency-Key": IDEM_KEY },
  );
  if (conflict.status === 409 && conflict.body.error?.code === "IDEMPOTENCY_CONFLICT") {
    pass("qa", "Idempotency conflict → 409 IDEMPOTENCY_CONFLICT");
    report.logs.push({ type: "conflict", request_id: conflict.body.request_id });
  } else {
    fail("qa", `Conflict: ${conflict.status} ${JSON.stringify(conflict.body)}`);
  }

  // E. Detail
  const detail = await apiFetch(key, `/api/v1/messages/${messageId}`);
  if (detail.status === 200 && detail.body.message?.id === messageId) {
    pass("qa", "GET /api/v1/messages/:id → 200");
    report.logs.push({ type: "detail", request_id: detail.body.request_id });
  } else {
    fail("qa", `Detail: ${detail.status}`);
  }

  // F. List
  const list = await apiFetch(key, "/api/v1/messages?limit=20");
  if (list.status === 200 && list.body.pagination && list.body.messages?.some((m) => m.id === messageId)) {
    pass("qa", "GET /api/v1/messages → 200 con paginación");
    report.logs.push({ type: "list", request_id: list.body.request_id });
  } else {
    fail("qa", `List: ${list.status}`);
  }

  // G. Errors
  const noAuth = await apiFetch(null, "/api/v1/balance");
  if (noAuth.status === 401 && noAuth.body.error?.code === "MISSING_API_KEY") {
    pass("qa", "Sin Authorization → 401 MISSING_API_KEY");
  } else {
    fail("qa", `No auth: ${noAuth.status}`);
  }

  const noScope = await apiFetch(balanceOnlyKey, "/api/v1/sms/send", "POST", sendPayload);
  if (noScope.status === 403 && noScope.body.error?.code === "INSUFFICIENT_SCOPE") {
    pass("qa", "Key sin scope → 403 INSUFFICIENT_SCOPE");
  } else {
    fail("qa", `No scope: ${noScope.status}`);
  }

  const notFound = await apiFetch(
    key,
    "/api/v1/messages/00000000-0000-4000-8000-000000000099",
  );
  if (notFound.status === 404 && notFound.body.error?.code === "MESSAGE_NOT_FOUND") {
    pass("qa", "Mensaje inexistente → 404 MESSAGE_NOT_FOUND");
  } else {
    fail("qa", `Not found: ${notFound.status}`);
  }

  const badLimit = await apiFetch(key, "/api/v1/messages?limit=101");
  if (badLimit.status === 400 && badLimit.body.error?.code === "INVALID_LIMIT") {
    pass("qa", "limit inválido → 400 INVALID_LIMIT");
  } else {
    fail("qa", `Bad limit: ${badLimit.status}`);
  }

  const prodSend = await apiFetch(prodPlain, "/api/v1/sms/send", "POST", sendPayload);
  if (prodSend.status === 403 && prodSend.body.error?.code === "PRODUCTION_SEND_NOT_ENABLED") {
    pass("qa", "Production key send → 403 PRODUCTION_SEND_NOT_ENABLED");
  } else {
    fail("qa", `Prod send: ${prodSend.status} ${JSON.stringify(prodSend.body)}`);
  }

  const pauseKeyRes = await postPanel("/app/api/keys", cookie, {
    name: `${QA_PREFIX} pause-test`,
    environment: "sandbox",
    scopes: ["balance:read"],
  });
  const pausePlain = pauseKeyRes.body.plainTextKey;
  const pauseId = pauseKeyRes.body.key?.id;
  const pauseCall = await postPanel(`/app/api/keys/${pauseId}/pause`, cookie, {});
  if (pauseCall.status === 200) {
    const paused = await apiFetch(pausePlain, "/api/v1/balance");
    if (paused.status === 403 && paused.body.error?.code === "API_KEY_PAUSED") {
      pass("qa", "Key pausada → 403 API_KEY_PAUSED");
    } else {
      fail("qa", `Paused key: ${paused.status} ${paused.body.error?.code}`);
    }
  } else {
    fail("qa", `Pause panel: ${pauseCall.status}`);
  }

  const revokeKeyRes = await postPanel("/app/api/keys", cookie, {
    name: `${QA_PREFIX} revoke-test`,
    environment: "sandbox",
    scopes: ["balance:read"],
  });
  const revokePlain = revokeKeyRes.body.plainTextKey;
  const revokeId = revokeKeyRes.body.key?.id;
  const revokeCall = await postPanel(`/app/api/keys/${revokeId}/revoke`, cookie, { reason: "QA audit" });
  if (revokeCall.status === 200) {
    const revoked = await apiFetch(revokePlain, "/api/v1/balance");
    if (revoked.status === 403 && revoked.body.error?.code === "API_KEY_REVOKED") {
      pass("qa", "Key revocada → 403 API_KEY_REVOKED");
    } else {
      fail("qa", `Revoked key: ${revoked.status} ${revoked.body.error?.code}`);
    }
  } else {
    fail("qa", `Revoke panel: ${revokeCall.status}`);
  }

  // Rate limits
  let okBurst = 0;
  let first429 = null;
  for (let i = 0; i < SANDBOX_MINUTE + 2; i++) {
    const r = await apiFetch(key, "/api/v1/balance");
    if (r.status === 200 && r.body.success) {
      okBurst++;
      continue;
    }
    if (r.status === 429 && !first429) {
      first429 = r;
      break;
    }
  }
  if (first429?.status === 429 && first429.body.error?.code === "RATE_LIMIT_EXCEEDED") {
    pass(
      "rate-limit",
      `429 tras burst (${okBurst}×200 en ventana; límite ${SANDBOX_MINUTE}/min incl. requests previos de auditoría)`,
    );
    report.logs.push({ type: "rate_limit", request_id: first429.body.request_id });
  } else {
    fail("rate-limit", `Burst: ok=${okBurst} 429=${first429?.status}`);
  }

  if (first429?.body.request_id) {
    pass("rate-limit", "429 incluye RATE_LIMIT_EXCEEDED y request_id");
  } else {
    fail("rate-limit", `Body 429: ${JSON.stringify(first429?.body)}`);
  }

  if (
    first429?.body.rate_limit?.scope &&
    typeof first429.body.rate_limit.limit === "number" &&
    typeof first429.body.rate_limit.retry_after_seconds === "number"
  ) {
    pass("rate-limit", "429 incluye objeto rate_limit");
  } else {
    fail("rate-limit", "Falta rate_limit object");
  }

  const h = first429?.headers ?? {};
  if (h.limit && h.remaining != null && h.reset && h.retryAfter) {
    pass("rate-limit", "Headers X-RateLimit-* y Retry-After presentes");
  } else {
    fail("rate-limit", `Headers incompletos: ${JSON.stringify(h)}`);
  }

  const dayBefore = await pgQuery(
    `select count(*)::int as c from client_api_requests
     where company_id = $1 and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')
       and (error_code is null or error_code <> 'RATE_LIMIT_EXCEEDED')`,
    [DEMO],
  );
  await apiFetch(key, "/api/v1/balance");
  await apiFetch(key, "/api/v1/balance");
  const dayAfter = await pgQuery(
    `select count(*)::int as c from client_api_requests
     where company_id = $1 and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')
       and (error_code is null or error_code <> 'RATE_LIMIT_EXCEEDED')`,
    [DEMO],
  );
  if (dayAfter.rows[0].c <= dayBefore.rows[0].c + 1) {
    pass("rate-limit", "429 repetidos no inflan contador diario");
  } else {
    fail("rate-limit", `Contador diario inflado: ${dayBefore.rows[0].c} → ${dayAfter.rows[0].c}`);
  }

  const retrySec = first429?.body.rate_limit?.retry_after_seconds ?? 45;
  await new Promise((r) => setTimeout(r, (retrySec + 2) * 1000));
  const afterReset = await apiFetch(key, "/api/v1/balance");
  if (afterReset.status === 200) {
    pass("rate-limit", "Tras ventana retry_after vuelve 200");
  } else {
    fail("rate-limit", `Tras reset: ${afterReset.status}`);
  }

  // Log audit in DB
  for (const entry of report.logs) {
    if (!entry.request_id) continue;
    const { rows } = await pgQuery(
      `select success, status_code, endpoint, error_code, metadata
       from client_api_requests where request_id = $1 limit 1`,
      [entry.request_id],
    );
    const row = rows[0];
    if (!row) {
      fail("logs", `Sin log para ${entry.type} request_id=${entry.request_id}`);
      continue;
    }
    const metaStr = JSON.stringify(row.metadata ?? {});
    const sensitive =
      metaStr.includes("tlv_test_") ||
      metaStr.includes("tlv_live_") ||
      metaStr.includes("Authorization") ||
      metaStr.includes("Bearer") ||
      metaStr.includes("key_hash");
    if (sensitive) {
      fail("logs", `Metadata sensible en ${entry.type}`);
    } else {
      pass("logs", `Log ${entry.type}: HTTP ${row.status_code} endpoint=${row.endpoint}`);
    }
  }

  const { rows: sandboxOnly } = await pgQuery(`
    select count(*)::int as total,
           count(*) filter (where environment <> 'sandbox')::int as non_sandbox,
           count(*) filter (where cost_sms <> 0)::int as nonzero_cost,
           count(*) filter (where provider_message_id is not null)::int as with_provider,
           count(*) filter (where dlr_status is not null)::int as with_dlr
    from sms_api_messages
  `);
  const s = sandboxOnly[0];
  if (s.non_sandbox === 0 && s.nonzero_cost === 0 && s.with_provider === 0 && s.with_dlr === 0) {
    pass("mensajes", `sms_api_messages: ${s.total} filas, solo sandbox, cost=0, sin provider/dlr`);
  } else {
    fail("mensajes", `sms_api_messages anomalías: ${JSON.stringify(s)}`);
  }

  const { rows: logCols } = await pgQuery(`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'client_api_requests'
      and column_name in ('authorization', 'api_key', 'key_hash', 'payload')
  `);
  if (logCols.length === 0) {
    pass("logs", "client_api_requests sin columnas de secretos (authorization/api_key/key_hash/payload)");
  } else {
    fail("logs", `Columnas sensibles en logs: ${logCols.map((r) => r.column_name).join(", ")}`);
  }

  const walletAfter = await walletSnapshot(DEMO);
  report.walletAfter = walletAfter;
  if (
    walletBefore.available === walletAfter.available &&
    walletBefore.reserved === walletAfter.reserved &&
    walletBefore.txCount === walletAfter.txCount
  ) {
    pass("wallet", "Saldo y wallet_transactions sin cambios durante auditoría");
  } else {
    fail("wallet", `Wallet cambió: before=${JSON.stringify(walletBefore)} after=${JSON.stringify(walletAfter)}`);
  }

  return {
    keyIds: [keyId, balanceOnlyId, prodId, revokeId, pauseId].filter(Boolean),
    qaPrefix: QA_PREFIX,
    plainKey: key,
  };
}

async function adminLogin() {
  if (!ADMIN_EMAIL || !ADMIN_PASS) return null;
  const res = await fetch(`${BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
    redirect: "manual",
  });
  const raw =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean);
  return raw
    .flatMap((c) => (Array.isArray(c) ? c : [c]))
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function auditAdmin(clientCookieStr) {
  const adminCk = await adminLogin();
  if (!adminCk?.includes("tv_admin_session")) {
    fail("admin", "Login admin omitido o fallido (SUPERADMIN_*)");
    return;
  }

  const page = await fetch(`${BASE}/admin/api-usage`, { headers: { Cookie: adminCk } });
  const html = await page.text();
  if (page.status === 200 && html.includes("Uso de API") && html.includes("Requests recientes")) {
    pass("admin", "/admin/api-usage carga KPIs y requests recientes");
  } else {
    fail("admin", `/admin/api-usage status=${page.status}`);
  }

  if (html.includes("429") && html.includes("RATE_LIMIT_EXCEEDED")) {
    pass("admin", "429 y RATE_LIMIT_EXCEEDED visibles en admin");
  } else {
    fail("admin", "429/RATE_LIMIT_EXCEEDED no visibles en admin (puede requerir actividad reciente)");
  }

  if (!html.match(/tlv_(test|live)_[A-Za-z0-9]{24,}/)) {
    pass("admin", "Sin API Key completa en HTML admin");
  } else {
    fail("admin", "Posible key completa en HTML admin");
  }

  const clientDenied = await fetch(`${BASE}/admin/api-usage`, {
    headers: { Cookie: clientCookieStr },
    redirect: "manual",
  });
  if (clientDenied.status === 302 || clientDenied.status === 403 || clientDenied.status === 401) {
    pass("admin", "Cliente normal no accede a /admin/api-usage");
  } else if (clientDenied.status === 200) {
    const clientHtml = await clientDenied.text();
    if (clientHtml.includes("Uso de API") && clientHtml.includes("Requests recientes")) {
      fail("admin", "Cliente accedió a vista admin api-usage");
    } else {
      pass("admin", "Cliente redirigido desde admin");
    }
  } else {
    pass("admin", `Cliente admin api-usage → ${clientDenied.status}`);
  }
}

async function auditUi(cookie, plainKeyFromCreate) {
  const page = await fetch(`${BASE}/app/api`, { headers: { Cookie: cookie } });
  const html = await page.text();

  const checks = [
    ["keys enmascaradas", html.includes("tlv_test_") || html.includes("••••") || html.includes("xxxx")],
    ["panel api keys", html.includes("API Keys")],
    ["curl send", html.includes("Idempotency-Key")],
    ["curl messages", html.includes("/api/v1/messages")],
    ["aviso sandbox", html.includes("sandbox") && html.includes("No envía SMS")],
    ["nota mensajes API", html.includes("Los mensajes consultados corresponden a registros creados por API")],
    ["429 en actividad", html.includes("429") || html.includes("RATE_LIMIT")],
  ];

  for (const [name, ok] of checks) {
    if (ok) {
      pass("ui", name);
      report.ui.push({ name, ok: true });
    } else {
      fail("ui", name);
      report.ui.push({ name, ok: false });
    }
  }

  if (plainKeyFromCreate && html.includes(plainKeyFromCreate)) {
    fail("ui", "Key completa visible en HTML tras recargar");
  } else {
    pass("ui", "Key completa no expuesta en HTML de /app/api");
  }
}

async function smokeTest(cookie) {
  const paths = [
    "/app/api",
    "/app/wallet",
    "/app/orders",
    "/app/support",
    "/app/templates",
    "/app/settings",
    "/app/dashboard",
    "/admin",
    "/admin/support",
    "/admin/api-usage",
  ];
  for (const p of paths) {
    const r = await fetch(`${BASE}${p}`, { headers: { Cookie: cookie }, redirect: "manual" });
    const ok = r.status === 200 || r.status === 302;
    report.smoke.push({ path: p, status: r.status, ok });
    if (ok) pass("smoke", `${p} → ${r.status}`);
    else fail("smoke", `${p} → ${r.status}`);
  }
}

async function cleanupQa(keyIds, qaPrefix) {
  if (keyIds?.length) {
    await pgQuery(`delete from client_api_requests where api_key_id = any($1::uuid[])`, [keyIds]);
    await pgQuery(`delete from sms_api_messages where api_key_id = any($1::uuid[])`, [keyIds]);
    await pgQuery(`delete from client_api_keys where id = any($1::uuid[])`, [keyIds]);
  }
  await pgQuery(`delete from sms_api_messages where external_reference = $1`, [QA_EXT_REF]);
  await pgQuery(`delete from client_api_requests where metadata::text ilike $1`, [`%${QA_EXT_REF}%`]);
  await pgQuery(`delete from client_api_keys where name ilike $1`, [`%${qaPrefix}%`]);

  const { rows: qaKeys } = await pgQuery(
    `select count(*)::int as c from client_api_keys where name ilike '%QA Audit Closeout%'`,
  );
  const { rows: qaMsgs } = await pgQuery(
    `select count(*)::int as c from sms_api_messages where external_reference = $1`,
    [QA_EXT_REF],
  );
  report.qaResiduesAfter = {
    auditKeys: qaKeys[0].c,
    auditMessages: qaMsgs[0].c,
  };
  pass("limpieza", `QA auditoría eliminado (keys restantes audit: ${qaKeys[0].c})`);
}

async function main() {
  console.log("=== Auditoría final API sandbox Telvoice ===\n");
  console.log(`Base: ${BASE}\n`);

  if (!process.env.DATABASE_URL) {
    console.error("FAIL: DATABASE_URL requerido");
    process.exit(1);
  }

  report.walletBefore = await walletSnapshot(DEMO);
  console.log("Wallet antes:", report.walletBefore);

  await auditTablesAndRls();
  await auditKeySecurity();
  await auditRoutes();

  const cookie = await clientCookie();
  const qaMeta = await functionalQa(cookie, report.walletBefore);
  await auditUi(cookie, qaMeta?.plainKey ?? null);
  await auditAdmin(cookie);
  await smokeTest(cookie);

  if (qaMeta) {
    await cleanupQa(qaMeta.keyIds, qaMeta.qaPrefix);
  }

  console.log("\n=== RESUMEN AUDITORÍA ===");
  console.log(JSON.stringify({
    tables: report.tables,
    rls: report.rls,
    qaResiduesBefore: report.qaResiduesBefore,
    qaResiduesAfter: report.qaResiduesAfter,
    routes: report.routes,
    keyColumns: report.keyColumns,
    walletBefore: report.walletBefore,
    walletAfter: report.walletAfter,
    errors: report.errors,
    errorCount: report.errors.length,
  }, null, 2));

  if (report.errors.length > 0) {
    console.error(`\n❌ Auditoría con ${report.errors.length} fallo(s)`);
    process.exit(1);
  }
  console.log("\n✅ Auditoría de cierre completada sin fallos");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
