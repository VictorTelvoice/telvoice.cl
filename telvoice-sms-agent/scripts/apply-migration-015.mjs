#!/usr/bin/env node
/**
 * Aplica 015_panel_sms_routing_columns.sql vía DATABASE_URL (.env).
 * Uso: node scripts/apply-migration-015.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  __dirname,
  "../supabase/migrations/015_panel_sms_routing_columns.sql",
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
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'panel_sms_messages'
      AND column_name IN (
        'provider_id', 'route_id', 'rate_plan_id',
        'sell_price_per_sms', 'cost_price_per_sms', 'currency', 'margin'
      )
    ORDER BY 1`);
  console.log("Migración 015 aplicada.");
  console.log("Columnas panel_sms_messages:", rows.map((r) => r.column_name).join(", "));
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
