#!/usr/bin/env node
/**
 * Aplica 017_multi_provider_routing.sql vía DATABASE_URL (.env).
 * Uso: node scripts/apply-migration-017.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  __dirname,
  "../supabase/migrations/017_multi_provider_routing.sql",
);

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("ERROR: DATABASE_URL no está definido.");
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
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'company_rate_plans'
       AND column_name = 'metadata'`,
  );
  if (!rows.length) {
    throw new Error("Falta company_rate_plans.metadata");
  }
  console.log("✓ Migración 017 aplicada (company_rate_plans.metadata)");
  console.log("Siguiente: node scripts/seed-chile-3-providers.mjs");
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
