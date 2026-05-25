#!/usr/bin/env node
/**
 * Aplica 020_sms_send_idempotency.sql vía DATABASE_URL (.env).
 * Uso: node scripts/apply-migration-020.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  __dirname,
  "../supabase/migrations/020_sms_send_idempotency.sql",
);

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error(
    "ERROR: DATABASE_URL no está definido. Configure telvoice-sms-agent/.env",
  );
  process.exit(1);
}

const sql = readFileSync(sqlPath, "utf8");

const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes("supabase")
    ? { rejectUnauthorized: false }
    : undefined,
});

function maskHost(conn) {
  try {
    const u = new URL(conn.replace(/^postgres:/, "postgresql:"));
    return `${u.hostname}:${u.port || "5432"}/${u.pathname.replace(/^\//, "")}`;
  } catch {
    return "(conexión configurada)";
  }
}

console.log("Conectando a:", maskHost(connectionString));
console.log("Aplicando: 020_sms_send_idempotency.sql");

await client.connect();
try {
  await client.query(sql);

  const { rows: tableRows } = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'sms_send_idempotency'
    ) AS ok;
  `);
  const { rows: indexRows } = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_sms_campaigns_company_idempotency_key';
  `);

  console.log("Tabla sms_send_idempotency:", tableRows[0]?.ok ? "OK" : "FALTA");
  console.log(
    "Índice idx_sms_campaigns_company_idempotency_key:",
    indexRows.length > 0 ? "OK" : "FALTA",
  );

  const { rows: dupes } = await client.query(`
    SELECT company_id, metadata->>'idempotency_key' AS idem_key, COUNT(*) AS n
    FROM sms_campaigns
    WHERE metadata->>'idempotency_key' IS NOT NULL
      AND metadata->>'idempotency_key' <> ''
    GROUP BY 1, 2
    HAVING COUNT(*) > 1
    ORDER BY n DESC
    LIMIT 10;
  `);
  if (dupes.length > 0) {
    console.log("\nCampañas duplicadas por idempotency_key (histórico):");
    console.table(dupes);
  } else {
    console.log("\nSin duplicados históricos por idempotency_key en campañas.");
  }

  console.log("\nMigración 020 aplicada correctamente.");
} finally {
  await client.end();
}
