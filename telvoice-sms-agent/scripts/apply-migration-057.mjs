#!/usr/bin/env node
/**
 * Aplica 057_billing_email_send_idempotency.sql vía DATABASE_URL (.env).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  __dirname,
  "../supabase/migrations/057_billing_email_send_idempotency.sql",
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
  const { rows } = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_billing_email_logs_invoice_recipient_type_active'
  `);
  console.log("OK: migración 057 aplicada (billing email idempotency).");
  console.log(
    "Índice único:",
    rows.length ? rows[0].indexname : "(no encontrado — revisar migración)",
  );
} finally {
  await client.end();
}
