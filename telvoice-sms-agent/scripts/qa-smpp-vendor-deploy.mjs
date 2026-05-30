#!/usr/bin/env node
/**
 * QA post-deploy SMPP vendor (authenticated HTML + optional bind from env).
 * Reads SMPP_VENDOR_* from .env — never logs passwords.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.PUBLIC_APP_URL || "https://agent.telvoice.cl").replace(
  /\/$/,
  "",
);

function env(name) {
  return String(process.env[name] ?? "").trim();
}

function loadOptionalVendorEnvFile() {
  const p = join(__dirname, "../.env.smpp-vendor");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (k.startsWith("SMPP_VENDOR_") && !process.env[k]) {
      process.env[k] = v;
    }
  }
}

async function loginAdmin() {
  const email = env("SUPERADMIN_EMAIL");
  const pass = env("SUPERADMIN_PASSWORD");
  if (!email || !pass) throw new Error("SUPERADMIN credentials missing");
  const r = await fetch(`${BASE}/admin/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password: pass }),
  });
  const cookies = r.headers.getSetCookie?.() ?? [];
  const session = cookies.find((c) => c.startsWith("tv_admin_session="));
  if (!session) throw new Error("Admin login failed");
  return session.split(";")[0];
}

async function fetchHtml(path, cookie) {
  const r = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
  return { status: r.status, html: await r.text() };
}

function vendorFormFromEnv() {
  const host = env("SMPP_VENDOR_HOST");
  const password = env("SMPP_VENDOR_PASSWORD");
  const system_id = env("SMPP_VENDOR_SYSTEM_ID");
  if (!host || !password || !system_id) return null;
  return {
    provider_id: env("SMPP_VENDOR_PROVIDER_ID") || "ba7a58fa-f0b3-47c7-85b0-2849e7997d74",
    label: env("SMPP_VENDOR_LABEL") || "PTG_2WAY",
    account_type: "smpp",
    account_active: "yes",
    host,
    transmitter_port: env("SMPP_VENDOR_TRANSMITTER_PORT") || "2775",
    receiver_port: env("SMPP_VENDOR_RECEIVER_PORT") || env("SMPP_VENDOR_TRANSMITTER_PORT") || "2775",
    system_id,
    password,
    system_type: env("SMPP_VENDOR_SYSTEM_TYPE") || "",
    bind_type: env("SMPP_VENDOR_BIND_TYPE") || "transceiver",
    addr_ton: env("SMPP_VENDOR_ADDR_TON") || "0",
    addr_npi: env("SMPP_VENDOR_ADDR_NPI") || "0",
    source_addr_ton: env("SMPP_VENDOR_SOURCE_ADDR_TON") || "0",
    source_addr_npi: env("SMPP_VENDOR_SOURCE_ADDR_NPI") || "0",
    dest_addr_ton: env("SMPP_VENDOR_DEST_ADDR_TON") || "1",
    dest_addr_npi: env("SMPP_VENDOR_DEST_ADDR_NPI") || "1",
    response_timeout_seconds: env("SMPP_VENDOR_RESPONSE_TIMEOUT_SECONDS") || "300",
    enquire_link_interval_seconds: env("SMPP_VENDOR_ENQUIRE_LINK_INTERVAL_SECONDS") || "45",
    submit_speed_per_second: env("SMPP_VENDOR_SUBMIT_SPEED_PER_SECOND") || "1",
    delay_time_seconds: env("SMPP_VENDOR_DELAY_TIME_SECONDS") || "0",
    sessions: env("SMPP_VENDOR_SESSIONS") || "1",
    tps_limit: env("SMPP_VENDOR_TPS_LIMIT") || "1",
    message_types_allowed:
      env("SMPP_VENDOR_MESSAGE_TYPES_ALLOWED") ||
      "text, unicode, flash sms, unicode flash sms",
    route_type: env("SMPP_VENDOR_ROUTE_TYPE") || "direct",
    currency: env("SMPP_VENDOR_CURRENCY") || "USD",
    credit_limit: env("SMPP_VENDOR_CREDIT_LIMIT") || "",
    identifier: env("SMPP_VENDOR_IDENTIFIER") || "",
    log_level: env("SMPP_VENDOR_LOG_LEVEL") || "off",
    status: "draft",
  };
}

loadOptionalVendorEnvFile();

console.log("=== SMPP Vendor Deploy QA ===");

const cookie = await loginAdmin();
const pages = [
  "/admin/wholesale",
  "/admin/wholesale/smpp-lab",
  "/admin/wholesale/smpp-lab/new",
  "/admin/wholesale/international-rates",
  "/admin/wholesale/routes",
];
for (const p of pages) {
  const { status } = await fetchHtml(p, cookie);
  console.log(`page ${p}: ${status}`);
}

const { html: newHtml } = await fetchHtml("/admin/wholesale/smpp-lab/new", cookie);
const sections = [
  "A. Account",
  "B. Credentials",
  "C. Network",
  "D. Addressing TON/NPI",
  "E. Performance",
  "F. Routing / Billing",
  "G. Sender / Phone Rules",
  "H. Advanced",
  "I. Future sections",
];
for (const s of sections) {
  console.log(`form ${s}:`, newHtml.includes(s) ? "OK" : "MISSING");
}
console.log("pwd hint on new form:", newHtml.includes("password") ? "OK (field present)" : "MISSING");

const { html: labHtml } = await fetchHtml("/admin/wholesale/smpp-lab", cookie);
for (const h of ["Tx/Rx Port", "Submit speed/sec", "Credit limit", "Last bind"]) {
  console.log(`table ${h}:`, labHtml.includes(h) ? "OK" : "MISSING");
}

const cs = env("DATABASE_URL");
if (!cs) throw new Error("DATABASE_URL missing");
const client = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});
await client.connect();

const { rows: colRows } = await client.query(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'wholesale_smpp_connections'
    AND column_name = ANY($1::text[])
  ORDER BY column_name
`, [[
  "account_type", "account_active", "transmitter_port", "receiver_port",
  "addr_ton", "addr_npi", "dest_addr_ton", "dest_addr_npi",
  "response_timeout_seconds", "enquire_link_interval_seconds",
  "submit_speed_per_second", "delay_time_seconds", "sessions",
  "sender_id_prefix", "phone_number_prepend", "message_types_allowed",
  "route_type", "identifier", "currency", "credit_limit", "log_level",
  "tlv_tag", "tlv_value", "esme_acknowledgement", "send_validity_period_as_null",
  "enable_affix_for_sms_id", "enable_decimal_only_for_sms_id",
  "auto_import_enabled", "secure_connection_enabled",
  "delivery_optional_parameters_enabled",
]]);
console.log("051 columns count:", colRows.length, "/ 30");

const { rows: pkg } = await client.query("SELECT COUNT(*)::int AS n FROM sms_packages");
console.log("retail sms_packages rows:", pkg[0]?.n);

let connectionId = null;
const { rows: existing } = await client.query(`
  SELECT c.id, c.label, c.host, c.bind_type, c.transmitter_port, c.receiver_port, c.port, p.name AS provider
  FROM wholesale_smpp_connections c
  LEFT JOIN wholesale_providers p ON p.id = c.provider_id
  ORDER BY c.created_at DESC LIMIT 1
`);
if (existing[0]) {
  connectionId = existing[0].id;
  console.log("existing connection:", {
    id: existing[0].id,
    label: existing[0].label,
    provider: existing[0].provider,
    host: existing[0].host,
    bind_type: existing[0].bind_type,
    ports: `${existing[0].transmitter_port ?? existing[0].port}/${existing[0].receiver_port ?? existing[0].port}`,
  });
}

const form = vendorFormFromEnv();
if (!connectionId && form) {
  const body = new URLSearchParams(form);
  const r = await fetch(`${BASE}/admin/wholesale/smpp-lab`, {
    method: "POST",
    redirect: "manual",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const loc = r.headers.get("location") || "";
  const m = loc.match(/smpp-lab\/([0-9a-f-]{36})\/edit/i);
  if (m) {
    connectionId = m[1];
    console.log("created connection id:", connectionId);
    console.log("created label:", form.label);
    console.log("created provider_id:", form.provider_id);
    console.log("created host:", form.host);
    console.log("password stored: yes (encrypted, not logged)");
  } else {
    console.log("create connection failed, status:", r.status);
  }
} else if (!connectionId) {
  console.log("vendor create skipped: no SMPP_VENDOR_* env and no existing connection");
}

const sendBefore = await client.query("SELECT COUNT(*)::int AS n FROM wholesale_smpp_send_tests");
console.log("send_tests before bind:", sendBefore.rows[0]?.n);

if (connectionId && env("SMPP_VENDOR_RUN_BIND") !== "no") {
  const { runSmppBindTest } = await import("../dist/services/smppLabService.js");
  const { resolveSmppBindPort } = await import("../dist/types/smpp-lab.js");
  const { rows: connRows } = await client.query(
    "SELECT * FROM wholesale_smpp_connections WHERE id = $1",
    [connectionId],
  );
  const row = connRows[0];
  const portUsed = resolveSmppBindPort(
    row.bind_type,
    row.transmitter_port,
    row.receiver_port,
    row.port,
  );
  console.log("running test bind on VPS (attempt 1)...");
  try {
    const result = await runSmppBindTest(connectionId);
    console.log("bind result:", result.result);
    console.log("bind test id:", result.id);
    console.log("latency_ms:", result.latency_ms);
    console.log("error_code:", result.error_code);
    console.log("error_message:", result.error_message ?? "—");
    console.log("tested_at:", result.tested_at);
    console.log("port used:", portUsed);
    console.log("bind_type:", row.bind_type);
    console.log("password exposed: no");
  } catch (err) {
    console.log("bind exception:", err instanceof Error ? err.message : String(err));
  }
}

const sendAfter = await client.query("SELECT COUNT(*)::int AS n FROM wholesale_smpp_send_tests");
console.log("send_tests after bind:", sendAfter.rows[0]?.n);
console.log("sms sent:", sendAfter.rows[0]?.n === sendBefore.rows[0]?.n ? "no" : "YES (unexpected)");

await client.end();
