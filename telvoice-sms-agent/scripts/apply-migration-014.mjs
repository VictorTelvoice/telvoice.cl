#!/usr/bin/env node
/**
 * Aplica 014_sms_routing_rateplans.sql vía DATABASE_URL (.env).
 * Uso: node scripts/apply-migration-014.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  __dirname,
  "../supabase/migrations/014_sms_routing_rateplans.sql",
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
      AND table_name IN (
        'sms_providers', 'sms_routes', 'sms_rate_plans',
        'sms_rate_plan_details', 'company_rate_plans'
      )
    ORDER BY 1`);
  console.log("Migración 014 aplicada.");
  console.log("Tablas:", rows.map((r) => r.table_name).join(", "));
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
