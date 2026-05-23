#!/usr/bin/env node
/**
 * Aplica precios comerciales CL + metadata (012_commercial_catalog_cl.sql).
 * Uso: node scripts/apply-commercial-catalog.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, "../supabase/seeds/012_commercial_catalog_cl.sql");
const connectionString = process.env.DATABASE_URL?.trim();

if (!connectionString) {
  console.error("DATABASE_URL no está definido en .env");
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
  await client.query(readFileSync(sqlPath, "utf8"));
  const { rows } = await client.query(`
    SELECT name, sms_quantity, unit_price, total_price, is_active, metadata
    FROM sms_packages
    ORDER BY sort_order, sms_quantity`);
  console.log("Catálogo comercial aplicado:\n");
  for (const r of rows) {
    console.log(
      `- ${r.name}: ${r.sms_quantity} SMS · $${Number(r.total_price).toLocaleString("es-CL")} · activa=${r.is_active} · metadata=${JSON.stringify(r.metadata)}`,
    );
  }
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
