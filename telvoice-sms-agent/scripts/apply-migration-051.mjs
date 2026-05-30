#!/usr/bin/env node
/**
 * Aplica 051_smpp_vendor_account_fields.sql vía DATABASE_URL (.env).
 * No ejecutar en producción hasta autorización explícita.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  __dirname,
  "../supabase/migrations/051_smpp_vendor_account_fields.sql",
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
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'wholesale_smpp_connections'
      AND column_name IN (
        'account_type',
        'transmitter_port',
        'receiver_port',
        'enquire_link_interval_seconds',
        'message_types_allowed',
        'credit_limit'
      )
    ORDER BY column_name
  `);
  console.log("OK: migración 051 aplicada.");
  console.log("Columnas verificadas:", rows.map((r) => r.column_name).join(", "));
} catch (err) {
  console.error("ERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end();
}
