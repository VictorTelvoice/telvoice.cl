#!/usr/bin/env node
/**
 * Aplica solo 010_multi_tenant_base.sql vía DATABASE_URL (.env).
 * Uso: node scripts/apply-migration-010.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  __dirname,
  "../supabase/migrations/010_multi_tenant_base.sql",
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
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('companies', 'user_profiles', 'company_users', 'audit_logs')
    ORDER BY table_name;
  `);
  const { rows: col } = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clients'
      AND column_name = 'company_id';
  `);
  console.log("Migración 010 aplicada correctamente.");
  console.log("Tablas:", rows.map((r) => r.table_name).join(", "));
  console.log(
    "clients.company_id:",
    col.length ? "presente" : "no encontrada",
  );
} catch (err) {
  console.error("Error al aplicar migración:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
