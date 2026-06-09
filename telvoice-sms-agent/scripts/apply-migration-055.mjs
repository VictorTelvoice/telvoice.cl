#!/usr/bin/env node
/**
 * Aplica 055_sim_activation_requests.sql vía DATABASE_URL (.env).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  __dirname,
  "../supabase/migrations/055_sim_activation_requests.sql",
);

const TABLE = "sim_activation_requests";

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
  const { rows: existing } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [TABLE],
  );
  if (existing.length) {
    console.log("SKIP: migración 055 ya aplicada (tabla existe).");
    process.exit(0);
  }

  const sql = readFileSync(sqlPath, "utf8");
  await client.query(sql);

  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [TABLE],
  );
  if (!rows.length) {
    console.error("ERROR: tabla sim_activation_requests no encontrada tras migración.");
    process.exit(1);
  }

  const { rows: idx } = await client.query(
    `SELECT indexname FROM pg_indexes
     WHERE tablename = $1 AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%order_id%'`,
    [TABLE],
  );
  console.log("OK: migración 055 aplicada.");
  console.log("Tabla:", TABLE);
  console.log("Índices UNIQUE(order_id):", idx.map((r) => r.indexname).join(", ") || "(verificar manualmente)");
} catch (err) {
  console.error("ERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end();
}
