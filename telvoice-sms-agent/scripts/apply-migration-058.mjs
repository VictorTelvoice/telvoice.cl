#!/usr/bin/env node
/**
 * Aplica 058_admin_data_audit_flags.sql vía DATABASE_URL (.env).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  __dirname,
  "../supabase/migrations/058_admin_data_audit_flags.sql",
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
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'admin_data_audit_flags'
    ORDER BY ordinal_position
  `);
  console.log("OK: migración 058 aplicada (admin_data_audit_flags).");
  console.log("Columnas:", rows.map((r) => r.column_name).join(", "));
} finally {
  await client.end();
}
