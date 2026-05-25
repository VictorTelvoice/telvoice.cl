#!/usr/bin/env node
/**
 * Aplica migraciones Telsim 018 + 019 vía DATABASE_URL (.env).
 * Uso: node scripts/apply-migration-telsim.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const files = [
  "018_telsim_inbound.sql",
  "019_telsim_line_phone_bindings.sql",
];

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("ERROR: DATABASE_URL no está definido en telvoice-sms-agent/.env");
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
  for (const file of files) {
    const sqlPath = join(__dirname, "../supabase/migrations", file);
    const sql = readFileSync(sqlPath, "utf8");
    await client.query(sql);
    console.log(`✓ ${file}`);
  }

  const { rows: tables } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('telsim_inbound_sms', 'telsim_slot_bindings')`,
  );
  const names = new Set(tables.map((r) => r.table_name));
  if (!names.has("telsim_inbound_sms") || !names.has("telsim_slot_bindings")) {
    throw new Error("Faltan tablas telsim tras migración");
  }

  const { rows: cols } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'telsim_inbound_sms'
       AND column_name = 'line_phone'`,
  );
  if (!cols.length) {
    throw new Error("Falta columna telsim_inbound_sms.line_phone");
  }

  console.log("✓ Migraciones Telsim listas (018 + 019)");
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
