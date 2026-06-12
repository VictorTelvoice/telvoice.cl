#!/usr/bin/env node
/**
 * Aplica 057_real_number_inventory.sql vía DATABASE_URL (.env).
 * Incluye respaldo lógico mínimo (conteos) antes y después.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";
import {
  fetchSensitiveTableCounts,
  findCountRegressions,
  formatCounts,
} from "./prod-sensitive-table-counts.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  __dirname,
  "../supabase/migrations/057_real_number_inventory.sql",
);

const TABLE = "real_number_inventory";

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
  console.log("=== Conteos previos (backup lógico mínimo) ===");
  const countsBefore = await fetchSensitiveTableCounts(client);
  console.log(formatCounts(countsBefore));

  const { rows: existing } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [TABLE],
  );
  if (existing.length) {
    console.log("SKIP: migración 057 ya aplicada (tabla existe).");
    console.log("=== Conteos posteriores (sin cambio de esquema) ===");
    const countsAfterSkip = await fetchSensitiveTableCounts(client);
    console.log(formatCounts(countsAfterSkip));
    const regressionsSkip = findCountRegressions(countsBefore, countsAfterSkip);
    if (regressionsSkip.length) {
      console.error("ERROR: conteos disminuyeron:");
      for (const row of regressionsSkip) {
        console.error(`  ${row.table}: ${row.before} -> ${row.after}`);
      }
      process.exit(1);
    }
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
    console.error("ERROR: tabla real_number_inventory no encontrada tras migración.");
    process.exit(1);
  }

  const { rows: col } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'sim_activation_requests' AND column_name = 'inventory_number_id'`,
  );

  console.log("=== Conteos posteriores ===");
  const countsAfter = await fetchSensitiveTableCounts(client);
  console.log(formatCounts(countsAfter));

  const regressions = findCountRegressions(countsBefore, countsAfter);
  if (regressions.length) {
    console.error("ERROR: conteos disminuyeron tras migración 057:");
    for (const row of regressions) {
      console.error(`  ${row.table}: ${row.before} -> ${row.after}`);
    }
    process.exit(1);
  }

  console.log("OK: migración 057 aplicada.");
  console.log("Tabla:", TABLE);
  console.log(
    "Columna sim_activation_requests.inventory_number_id:",
    col.length ? "presente" : "NO encontrada",
  );
  console.log("OK: conteos sensibles no disminuyeron.");
} catch (err) {
  console.error("ERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end();
}
