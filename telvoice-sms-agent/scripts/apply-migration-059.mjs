#!/usr/bin/env node
/**
 * Aplica 059_admin_action_logs.sql vía DATABASE_URL (.env).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  __dirname,
  "../supabase/migrations/059_admin_action_logs.sql",
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
      AND table_name = 'admin_action_logs'
    ORDER BY ordinal_position
  `);
  const archived = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'admin_data_audit_flags'
      AND column_name = 'archived_at'
  `);
  console.log("OK: migración 059 aplicada (admin_action_logs).");
  console.log("admin_action_logs:", rows.map((r) => r.column_name).join(", "));
  console.log(
    "admin_data_audit_flags.archived_at:",
    archived.rows.length ? "presente" : "ausente",
  );
} finally {
  await client.end();
}
