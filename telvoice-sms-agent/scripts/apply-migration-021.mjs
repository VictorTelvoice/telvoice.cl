#!/usr/bin/env node
/**
 * Aplica 021_companies_metadata.sql vía DATABASE_URL (.env).
 * Recarga schema cache de PostgREST tras agregar companies.metadata.
 * Uso: npm run migrate:021
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  __dirname,
  "../supabase/migrations/021_companies_metadata.sql",
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
  await client.query(`SELECT pg_notify('pgrst', 'reload schema');`);

  const { rows } = await client.query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND column_name = 'metadata';
  `);

  if (!rows.length) {
    console.error("ERROR: companies.metadata no aparece tras la migración.");
    process.exit(1);
  }

  console.log("OK: migración 021 aplicada.");
  console.log("OK: companies.metadata", rows[0].data_type, "default", rows[0].column_default);
  console.log("OK: pg_notify('pgrst', 'reload schema') enviado.");
} catch (err) {
  console.error("ERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end();
}
