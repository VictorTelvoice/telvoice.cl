#!/usr/bin/env node
/**
 * Aplica 062_inbound_sms_unread_counts_rpc.sql vía DATABASE_URL (.env).
 * Flujo habitual del repo (mismo patrón que migrate:058).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  __dirname,
  "../supabase/migrations/062_inbound_sms_unread_counts_rpc.sql",
);

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
  const sql = readFileSync(sqlPath, "utf8");
  await client.query(sql);

  const { rows: idx } = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_inbound_sms_company_unread'
  `);

  const { rows: fn } = await client.query(`
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'count_inbound_sms_unread_by_number'
  `);

  const { rows: grant } = await client.query(`
    SELECT has_function_privilege('service_role', 'public.count_inbound_sms_unread_by_number(uuid, uuid)', 'EXECUTE') AS ok
  `);

  console.log("OK: migración 062 aplicada (inbound SMS unread RPC).");
  console.log("Índice parcial:", idx.length ? idx[0].indexname : "(no encontrado)");
  console.log(
    "Función RPC:",
    fn.length ? "count_inbound_sms_unread_by_number" : "(no encontrada)",
  );
  console.log(
    "GRANT service_role EXECUTE:",
    grant[0]?.ok === true ? "sí" : "no",
  );

  if (!idx.length || !fn.length || grant[0]?.ok !== true) {
    process.exit(1);
  }
} finally {
  await client.end();
}
