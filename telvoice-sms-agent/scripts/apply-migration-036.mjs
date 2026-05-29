#!/usr/bin/env node
/**
 * Aplica 036_sms_api_messages_idempotency.sql vía DATABASE_URL (.env).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  __dirname,
  "../supabase/migrations/036_sms_api_messages_idempotency.sql",
);

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("ERROR: DATABASE_URL no está definido.");
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
  const sql = readFileSync(sqlPath, "utf8");
  await client.query(sql);
  const { rows } = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'sms_api_messages'
    ORDER BY indexname
  `);
  const { rows: cols } = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sms_api_messages'
      AND column_name IN ('idempotency_key', 'payload_hash')
    ORDER BY column_name
  `);
  console.log("OK: migración 036 aplicada (idempotencia sms_api_messages).");
  console.log("Columnas:", cols.map((r) => r.column_name).join(", "));
  console.log("Índices:", rows.map((r) => r.indexname).join(", "));
} catch (err) {
  console.error("ERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end();
}
