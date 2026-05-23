#!/usr/bin/env node
/**
 * Aplica 013_sms_live_test_mode.sql vía DATABASE_URL (.env).
 * Uso: node scripts/apply-migration-013.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  __dirname,
  "../supabase/migrations/013_sms_live_test_mode.sql",
);

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("DATABASE_URL no está definido en .env");
  process.exit(1);
}

const sql = readFileSync(sqlPath, "utf8");
const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes("supabase")
    ? { rejectUnauthorized: false }
    : undefined,
});

await client.connect();
try {
  await client.query(sql);
  const { rows } = await client.query(`
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'panel_sms_messages'::regclass
      AND conname LIKE '%mode%'
    LIMIT 5`);
  console.log("Migración 013 aplicada.");
  console.log("Constraints mode:", rows.map((r) => r.conname).join(", "));
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
