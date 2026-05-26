#!/usr/bin/env node
/**
 * Aplica 023_contacts.sql vía DATABASE_URL (.env).
 * Migración aditiva: contact_lists, contacts, members, tags (sin RLS).
 *
 * Uso: node scripts/apply-migration-023.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, "../supabase/migrations/023_contacts.sql");

const CONTACT_TABLES = [
  "contact_lists",
  "contacts",
  "contact_list_members",
  "contact_tags",
  "contact_tag_assignments",
];

const REQUIRED_INDEXES = [
  "idx_contacts_company_phone_normalized_unique",
  "idx_contact_lists_company_name_lower_unique",
];

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error(
    "ERROR: DATABASE_URL no está definido. Configure telvoice-sms-agent/.env",
  );
  process.exit(1);
}

const sql = readFileSync(sqlPath, "utf8");

if (/\bDROP\s+TABLE\b/i.test(sql)) {
  console.error("ERROR: La migración 023 contiene DROP TABLE (no permitido).");
  process.exit(1);
}

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

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

console.log("Conectando a:", maskHost(connectionString));
console.log("Aplicando: 023_contacts.sql");

await client.connect();
try {
  const { rows: beforeCounts } = await client.query(`
    SELECT
      (SELECT count(*)::int FROM sms_orders) AS sms_orders,
      (SELECT count(*)::int FROM wallet_transactions) AS wallet_transactions
  `);
  const smsOrdersBefore = beforeCounts[0].sms_orders;
  const walletTxBefore = beforeCounts[0].wallet_transactions;

  const existingBefore = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [CONTACT_TABLES],
  );
  const hadAllTables =
    existingBefore.rows.length === CONTACT_TABLES.length;

  await client.query(sql);

  const { rows: afterCounts } = await client.query(`
    SELECT
      (SELECT count(*)::int FROM sms_orders) AS sms_orders,
      (SELECT count(*)::int FROM wallet_transactions) AS wallet_transactions
  `);
  assert(
    afterCounts[0].sms_orders === smsOrdersBefore,
    "sms_orders cambió de filas tras migración (no debería)",
  );
  assert(
    afterCounts[0].wallet_transactions === walletTxBefore,
    "wallet_transactions cambió de filas tras migración (no debería)",
  );

  const { rows: tables } = await client.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])
     ORDER BY table_name`,
    [CONTACT_TABLES],
  );
  const found = tables.map((r) => r.table_name);
  for (const name of CONTACT_TABLES) {
    console.log(`Tabla ${name}:`, found.includes(name) ? "OK" : "FALTA");
    assert(found.includes(name), `Falta tabla ${name}`);
  }

  const { rows: indexes } = await client.query(
    `SELECT indexname FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = ANY($1::text[])`,
    [REQUIRED_INDEXES],
  );
  const indexNames = indexes.map((r) => r.indexname);
  for (const idx of REQUIRED_INDEXES) {
    console.log(`Índice ${idx}:`, indexNames.includes(idx) ? "OK" : "FALTA");
    assert(indexNames.includes(idx), `Falta índice ${idx}`);
  }

  const { rows: rlsRows } = await client.query(
    `SELECT c.relname, c.relrowsecurity
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = ANY($1::text[])`,
    [CONTACT_TABLES],
  );
  for (const row of rlsRows) {
    const rlsOn = row.relrowsecurity === true;
    console.log(`RLS ${row.relname}:`, rlsOn ? "ACTIVADO (revisar)" : "desactivado OK");
    assert(!rlsOn, `RLS activado en ${row.relname} (no esperado en esta etapa)`);
  }

  if (hadAllTables) {
    console.log("\nMigración 023: tablas ya existían; SQL re-ejecutado de forma idempotente.");
  } else {
    console.log("\nMigración 023 aplicada correctamente (tablas nuevas).");
  }
  console.log("Wallet y sms_orders: sin cambios de conteo.");
} catch (err) {
  console.error("Error:", err?.message ?? err);
  process.exit(1);
} finally {
  await client.end();
}
