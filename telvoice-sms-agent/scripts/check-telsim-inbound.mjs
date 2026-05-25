#!/usr/bin/env node
/**
 * Lista los últimos SMS entrantes Telsim en Supabase.
 */
import "dotenv/config";
import pg from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("DATABASE_URL no definido");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes("supabase")
    ? { rejectUnauthorized: false }
    : undefined,
});

await client.connect();
try {
  const { rows: tables } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN ('telsim_inbound_sms', 'telsim_slot_bindings')`,
  );
  console.log("Tablas:", tables.map((r) => r.table_name).join(", ") || "(ninguna)");

  const { rows: recent } = await client.query(
    `SELECT id, sender_from, LEFT(content, 80) AS content_preview,
            verification_code, slot_id, line_phone, received_at, created_at
     FROM telsim_inbound_sms
     ORDER BY received_at DESC
     LIMIT 8`,
  );
  console.log("\nÚltimos SMS entrantes (telsim_inbound_sms):", recent.length);
  for (const r of recent) {
    console.log("---");
    console.log("  received_at:", r.received_at);
    console.log("  from:", r.sender_from);
    console.log("  slot_id:", r.slot_id);
    console.log("  line_phone:", r.line_phone);
    console.log("  code:", r.verification_code);
    console.log("  content:", r.content_preview);
  }

  const { rows: bindings } = await client.query(
    `SELECT slot_id, verify_phone, updated_at FROM telsim_slot_bindings ORDER BY updated_at DESC LIMIT 8`,
  );
  console.log("\nBindings slot ↔ línea:", bindings.length);
  for (const b of bindings) {
    console.log(`  ${b.slot_id} → ${b.verify_phone} (${b.updated_at})`);
  }
} finally {
  await client.end();
}
