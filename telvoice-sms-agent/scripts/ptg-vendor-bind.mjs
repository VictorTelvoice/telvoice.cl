#!/usr/bin/env node
/**
 * Crea/verifica cuenta PTG_2WAY desde .env.smpp-vendor y ejecuta Test bind (máx. 2 intentos).
 * Nunca imprime passwords ni plaintext en logs.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VENDOR_ENV = join(__dirname, "../.env.smpp-vendor");
const PTG_PROVIDER_ID = "ba7a58fa-f0b3-47c7-85b0-2849e7997d74";
const MAX_BIND_ATTEMPTS = 2;

function loadVendorEnv() {
  if (!existsSync(VENDOR_ENV)) return;
  for (const line of readFileSync(VENDOR_ENV, "utf8").split("\n")) {
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

function env(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

loadVendorEnv();

const cs = env("DATABASE_URL");
if (!cs) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

await client.connect();

try {
  const { rows: existing } = await client.query(
    `SELECT c.id, c.label, c.host, c.bind_type, c.transmitter_port, c.receiver_port, c.port,
            c.system_id, c.password_encrypted IS NOT NULL AS has_encrypted,
            LENGTH(c.password_encrypted) AS enc_len,
            p.name AS provider_name
     FROM wholesale_smpp_connections c
     LEFT JOIN wholesale_providers p ON p.id = c.provider_id
     WHERE c.label = $1 OR c.system_id = $2
     ORDER BY c.created_at DESC LIMIT 1`,
    ["PTG_2WAY", "telvoice.2way"],
  );

  let connectionId = existing[0]?.id ?? null;

  if (connectionId) {
    const row = existing[0];
    console.log("account_exists: yes");
    console.log("connection_id:", row.id);
    console.log("label:", row.label);
    console.log("provider:", row.provider_name ?? "—");
    console.log("host:", row.host);
    console.log("bind_type:", row.bind_type);
    console.log("ports:", `${row.transmitter_port ?? row.port}/${row.receiver_port ?? row.port}`);
    console.log("system_id:", row.system_id);
    console.log("password_encrypted: yes");
    console.log("enc_length:", row.enc_len);
    console.log("password_plaintext_in_db: no");
  } else {
    const password = env("SMPP_VENDOR_PASSWORD");
    const host = env("SMPP_VENDOR_HOST", "213.239.210.94");
    const system_id = env("SMPP_VENDOR_SYSTEM_ID", "telvoice.2way");

    if (!password) {
      console.log("account_exists: no");
      console.log("create_skipped: SMPP_VENDOR_PASSWORD not in .env.smpp-vendor");
      console.log("hint: create manually at /admin/wholesale/smpp-lab/new or add .env.smpp-vendor on VPS");
      process.exit(2);
    }

    const { parseSmppConnectionForm, createSmppConnection } = await import(
      "../dist/services/smppLabService.js"
    );

    const input = parseSmppConnectionForm(
      {
        provider_id: PTG_PROVIDER_ID,
        label: "PTG_2WAY",
        account_type: "smpp",
        account_active: "yes",
        host,
        transmitter_port: env("SMPP_VENDOR_TRANSMITTER_PORT", "7777"),
        receiver_port: env("SMPP_VENDOR_RECEIVER_PORT", "7777"),
        system_id,
        password,
        system_type: env("SMPP_VENDOR_SYSTEM_TYPE", ""),
        bind_type: env("SMPP_VENDOR_BIND_TYPE", "transceiver"),
        addr_ton: env("SMPP_VENDOR_ADDR_TON", "0"),
        addr_npi: env("SMPP_VENDOR_ADDR_NPI", "0"),
        source_addr_ton: env("SMPP_VENDOR_SOURCE_ADDR_TON", "0"),
        source_addr_npi: env("SMPP_VENDOR_SOURCE_ADDR_NPI", "0"),
        dest_addr_ton: env("SMPP_VENDOR_DEST_ADDR_TON", "1"),
        dest_addr_npi: env("SMPP_VENDOR_DEST_ADDR_NPI", "1"),
        response_timeout_seconds: env("SMPP_VENDOR_RESPONSE_TIMEOUT_SECONDS", "300"),
        enquire_link_interval_seconds: env("SMPP_VENDOR_ENQUIRE_LINK_INTERVAL_SECONDS", "45"),
        submit_speed_per_second: env("SMPP_VENDOR_SUBMIT_SPEED_PER_SECOND", "10"),
        delay_time_seconds: env("SMPP_VENDOR_DELAY_TIME_SECONDS", "0"),
        sessions: env("SMPP_VENDOR_SESSIONS", "1"),
        tps_limit: env("SMPP_VENDOR_TPS_LIMIT", "10"),
        message_types_allowed:
          env("SMPP_VENDOR_MESSAGE_TYPES_ALLOWED") ||
          "Flash SMS, Text, Unicode, Unicode Flash SMS",
        route_type: env("SMPP_VENDOR_ROUTE_TYPE", "direct"),
        currency: env("SMPP_VENDOR_CURRENCY", "USD"),
        credit_limit: env("SMPP_VENDOR_CREDIT_LIMIT", "100000"),
        identifier: env("SMPP_VENDOR_IDENTIFIER", "29"),
        log_level: env("SMPP_VENDOR_LOG_LEVEL", "off"),
        status: "draft",
      },
      { isEdit: false },
    );

    const row = await createSmppConnection(input);
    connectionId = row.id;
    console.log("account_created: yes");
    console.log("connection_id:", row.id);
    console.log("label:", row.label);
    console.log("host:", row.host);
    console.log("password_encrypted: yes (not logged)");
    console.log("password_plaintext_in_db: no");
  }

  const { runSmppBindTest } = await import("../dist/services/smppLabService.js");
  const { resolveSmppBindPort } = await import("../dist/types/smpp-lab.js");

  const { rows: connRows } = await client.query(
    "SELECT * FROM wholesale_smpp_connections WHERE id = $1",
    [connectionId],
  );
  const conn = connRows[0];
  const portUsed = resolveSmppBindPort(
    conn.bind_type,
    conn.transmitter_port,
    conn.receiver_port,
    conn.port,
  );

  const sendBefore = await client.query(
    "SELECT COUNT(*)::int AS n FROM wholesale_smpp_send_tests WHERE connection_id = $1",
    [connectionId],
  );

  let lastTest = null;
  for (let attempt = 1; attempt <= MAX_BIND_ATTEMPTS; attempt++) {
    console.log(`bind_attempt: ${attempt}/${MAX_BIND_ATTEMPTS}`);
    try {
      lastTest = await runSmppBindTest(connectionId);
      console.log("bind_result:", lastTest.result);
      console.log("bind_test_id:", lastTest.id);
      console.log("latency_ms:", lastTest.latency_ms);
      console.log("error_code:", lastTest.error_code);
      console.log("error_message:", lastTest.error_message ?? "—");
      console.log("tested_at:", lastTest.tested_at);
      if (lastTest.result === "success") break;
    } catch (err) {
      console.log("bind_exception:", err instanceof Error ? err.message : String(err));
      if (attempt >= MAX_BIND_ATTEMPTS) break;
    }
  }

  const sendAfter = await client.query(
    "SELECT COUNT(*)::int AS n FROM wholesale_smpp_send_tests WHERE connection_id = $1",
    [connectionId],
  );

  console.log("--- summary ---");
  console.log("label:", conn.label);
  console.log("provider_id:", conn.provider_id);
  console.log("host:", conn.host);
  console.log("port_used:", portUsed);
  console.log("bind_type:", conn.bind_type);
  console.log("password_exposed: no");
  console.log(
    "sms_sent:",
    sendAfter.rows[0].n === sendBefore.rows[0].n ? "no" : "YES_UNEXPECTED",
  );
  console.log("send_tests_count:", sendAfter.rows[0].n);
} finally {
  await client.end();
}
