#!/usr/bin/env node
/**
 * Aplica 024_contact_import_jobs.sql vía DATABASE_URL (.env).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, "../supabase/migrations/024_contact_import_jobs.sql");
const TABLES = ["contact_import_jobs", "contact_import_rows"];

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("ERROR: DATABASE_URL no definido");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

await client.connect();
try {
  const { rows: before } = await client.query(
    `SELECT count(*)::int AS w FROM wallet_transactions`,
  );
  const walletBefore = before[0].w;
  await client.query(readFileSync(sqlPath, "utf8"));
  const { rows: after } = await client.query(
    `SELECT count(*)::int AS w FROM wallet_transactions`,
  );
  if (after[0].w !== walletBefore) {
    throw new Error("wallet_transactions cambió");
  }
  for (const t of TABLES) {
    const { rows } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
      [t],
    );
    console.log(`Tabla ${t}:`, rows.length ? "OK" : "FALTA");
    if (!rows.length) process.exit(1);
  }
  console.log("Migración 024 OK");
} finally {
  await client.end();
}
