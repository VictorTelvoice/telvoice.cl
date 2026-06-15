#!/usr/bin/env node
/**
 * Valida migración 062: RPC + poll service + endpoint HTTP (local/QA).
 */
import "dotenv/config";
import jwt from "jsonwebtoken";
import pg from "pg";

const DEMO_EMAIL = "cliente.demo@telvoice.cl";
const CLIENT_COOKIE = "tv_client_session";
const BASE = (process.env.PUBLIC_APP_URL || "http://localhost:3001").replace(
  /\/$/,
  "",
);

let fallbackWarnSeen = false;
const origWarn = console.warn.bind(console);
console.warn = (...args) => {
  const msg = args.map(String).join(" ");
  if (msg.includes("count_inbound_sms_unread_by_number no disponible")) {
    fallbackWarnSeen = true;
  }
  origWarn(...args);
};

function fail(msg) {
  console.error("FAIL:", msg);
  process.exitCode = 1;
}

function ok(msg) {
  console.log("OK:", msg);
}

async function pgQuery(text, params) {
  const conn = process.env.DATABASE_URL?.trim();
  if (!conn) throw new Error("DATABASE_URL requerido");
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
  if (!process.env.JWT_SECRET?.trim()) {
    throw new Error("JWT_SECRET requerido para prueba HTTP del poll");
  }
  const { rows } = await pgQuery(
    `SELECT au.id, au.email, au.name, up.role, up.company_id
     FROM admin_users au
     JOIN user_profiles up ON up.admin_user_id = au.id
     WHERE lower(au.email) = lower($1)`,
    [DEMO_EMAIL],
  );
  const u = rows[0];
  if (!u?.company_id) throw new Error("Usuario demo sin empresa");
  const token = jwt.sign(
    { sub: u.id, email: u.email, name: u.name, role: u.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h", issuer: "telvoice-sms-agent", audience: "telvoice-admin" },
  );
  return { cookie: `${CLIENT_COOKIE}=${token}`, companyId: String(u.company_id) };
}

async function testRpcDirect(companyId) {
  const { getSupabase } = await import("../dist/database/supabaseClient.js");
  const sb = getSupabase();
  const { data, error } = await sb.rpc("count_inbound_sms_unread_by_number", {
    p_company_id: companyId,
    p_client_number_id: null,
  });
  if (error) {
    console.log(
      "RPC_TEST: FAIL",
      JSON.stringify({ code: error.code, message: error.message }),
    );
    fail("RPC directa falló");
    return false;
  }
  const rows = data ?? [];
  const total = rows.reduce((s, r) => s + Number(r.unread_count || 0), 0);
  console.log(
    "RPC_TEST: OK",
    JSON.stringify({ company_id: companyId, groups: rows.length, unread_total: total }),
  );
  ok("RPC count_inbound_sms_unread_by_number disponible (sin PGRST202)");
  return true;
}

async function testPollService(companyId) {
  const { pollInboundSmsForCompany } = await import(
    "../dist/services/inboundSmsService.js"
  );
  const after = new Date(Date.now() - 86_400_000).toISOString();
  const result = await pollInboundSmsForCompany(companyId, {
    afterReceivedAt: after,
    limit: 30,
  });
  if (result.messages.length > 30) {
    fail(`poll service devolvió ${result.messages.length} mensajes (máx 30)`);
  }
  for (const m of result.messages) {
    if ("raw_payload" in m && m.raw_payload != null) {
      fail("poll service incluye raw_payload");
      break;
    }
    if (m.metadata && Object.keys(m.metadata).length > 0) {
      fail("poll service incluye metadata");
      break;
    }
  }
  ok(
    `pollInboundSmsForCompany: ${result.messages.length} mensajes (≤30), unread_total=${result.unreadTotal}`,
  );
  return result;
}

async function testPollHttp(cookie) {
  const after = new Date(Date.now() - 86_400_000).toISOString();
  const url = `${BASE}/api/app/sms-inbox/poll?after=${encodeURIComponent(after)}`;
  let res;
  try {
    res = await fetch(url, {
      headers: { Cookie: cookie, Accept: "application/json" },
    });
  } catch (e) {
    console.warn("WARN: HTTP poll omitido (servidor no accesible en " + BASE + ")");
    return;
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    fail(`HTTP poll ${res.status}: ${JSON.stringify(body)}`);
    return;
  }
  if (!Array.isArray(body.messages)) {
    fail("HTTP poll sin array messages");
    return;
  }
  if (body.messages.length > 30) {
    fail(`HTTP poll devolvió ${body.messages.length} mensajes`);
    return;
  }
  for (const m of body.messages) {
    if (m.raw_payload != null) fail("HTTP poll incluye raw_payload");
    if (m.metadata != null) fail("HTTP poll incluye metadata");
  }
  if (typeof body.unread_by_number !== "object") {
    fail("HTTP poll sin unread_by_number");
    return;
  }
  ok(`GET /api/app/sms-inbox/poll → ok (${body.messages.length} mensajes)`);
}

async function main() {
  const { rows: sample } = await pgQuery(
    `SELECT company_id FROM inbound_sms_messages LIMIT 1`,
  );
  let companyId = sample[0]?.company_id;
  if (!companyId) {
    const demo = await pgQuery(
      `SELECT up.company_id FROM user_profiles up
       JOIN admin_users au ON au.id = up.admin_user_id
       WHERE lower(au.email) = lower($1) LIMIT 1`,
      [DEMO_EMAIL],
    );
    companyId = demo.rows[0]?.company_id;
  }
  if (!companyId) {
    fail("Sin company_id para pruebas");
    return;
  }

  const rpcOk = await testRpcDirect(String(companyId));
  if (!rpcOk) return;

  await testPollService(String(companyId));

  if (fallbackWarnSeen) {
    fail("Se activó fallback legacy (warning en logs)");
  } else {
    ok("Sin fallback legacy en poll service");
  }

  try {
    const { cookie } = await clientCookie();
    await testPollHttp(cookie);
  } catch (e) {
    console.warn("WARN: HTTP poll omitido —", e instanceof Error ? e.message : e);
  }
}

await main();
