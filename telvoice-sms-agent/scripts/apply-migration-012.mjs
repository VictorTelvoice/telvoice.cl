#!/usr/bin/env node
/**
 * Aplica 012_sms_campaigns_messages.sql vía DATABASE_URL (.env).
 * Uso: node scripts/apply-migration-012.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  __dirname,
  "../supabase/migrations/012_sms_campaigns_messages.sql",
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
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('sms_campaigns', 'panel_sms_messages', 'panel_sms_delivery_events')
    ORDER BY 1`);
  console.log("Migración 012 aplicada.");
  console.log("Tablas:", rows.map((r) => r.table_name).join(", "));
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
