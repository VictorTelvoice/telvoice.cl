#!/usr/bin/env node
/**
 * Ejecuta Test bind sobre cuenta PTG_2WAY existente (máx. 2 intentos).
 * No crea cuentas. No envía SMS. No imprime passwords.
 */
import "dotenv/config";
import pg from "pg";

const MAX_ATTEMPTS = 2;
const LABEL = "PTG_2WAY";
const SYSTEM_ID = "telvoice.2way";

const cs = process.env.DATABASE_URL?.trim();
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
  const sendBefore = await client.query(
    "SELECT COUNT(*)::int AS n FROM wholesale_smpp_send_tests",
  );

  const { rows } = await client.query(
    `SELECT c.id, c.label, c.host, c.bind_type, c.transmitter_port, c.receiver_port, c.port,
            c.system_id, c.status,
            (c.password_encrypted IS NOT NULL AND length(c.password_encrypted) > 0) AS has_encrypted,
            length(c.password_encrypted) AS enc_len,
            p.name AS provider_name
     FROM wholesale_smpp_connections c
     LEFT JOIN wholesale_providers p ON p.id = c.provider_id
     WHERE c.label = $1 OR c.system_id = $2
     ORDER BY c.created_at DESC LIMIT 1`,
    [LABEL, SYSTEM_ID],
  );

  if (!rows[0]) {
    console.log("account_found: no");
    console.log("bind_executed: no");
    process.exit(2);
  }

  const row = rows[0];
  console.log("account_found: yes");
  console.log("connection_id:", row.id);
  console.log("label:", row.label);
  console.log("provider:", row.provider_name ?? "—");
  console.log("host:", row.host);
  console.log("bind_type:", row.bind_type);
  console.log("status:", row.status);
  console.log("password_encrypted: yes");
  console.log("enc_length:", row.enc_len);
  console.log("password_exposed: no");

  const { runSmppBindTest } = await import("../dist/services/smppLabService.js");
  const { resolveSmppBindPort } = await import("../dist/types/smpp-lab.js");

  const portUsed = resolveSmppBindPort(
    row.bind_type,
    row.transmitter_port,
    row.receiver_port,
    row.port,
  );
  console.log("port_used:", portUsed);

  let lastTest = null;
  let attempts = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attempts = attempt;
    console.log(`bind_attempt: ${attempt}/${MAX_ATTEMPTS}`);
    try {
      lastTest = await runSmppBindTest(row.id);
      console.log("bind_result:", lastTest.result);
      console.log("bind_test_id:", lastTest.id);
      console.log("latency_ms:", lastTest.latency_ms);
      console.log("error_code:", lastTest.error_code ?? "—");
      console.log("error_message:", lastTest.error_message ?? "—");
      console.log("tested_at:", lastTest.tested_at);
      if (lastTest.result === "success") break;
    } catch (err) {
      console.log("bind_exception:", err instanceof Error ? err.message : String(err));
      if (attempt >= MAX_ATTEMPTS) break;
    }
  }

  const sendAfter = await client.query(
    "SELECT COUNT(*)::int AS n FROM wholesale_smpp_send_tests",
  );

  console.log("--- summary ---");
  console.log("attempts:", attempts);
  console.log(
    "sms_sent:",
    sendAfter.rows[0].n === sendBefore.rows[0].n ? "no" : "YES_UNEXPECTED",
  );
  console.log("send_tests_count:", sendAfter.rows[0].n);
} finally {
  await client.end();
}
