#!/usr/bin/env node
/**
 * Aplica 063_support_ticket_code_global_unique.sql vía DATABASE_URL (.env).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  __dirname,
  "../supabase/migrations/063_support_ticket_code_global_unique.sql",
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
      AND indexname = 'idx_client_support_tickets_ticket_code_unique'
  `);

  const { rows: fn } = await client.query(`
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'next_support_ticket_code'
  `);

  const { rows: dups } = await client.query(`
    SELECT ticket_code, COUNT(*)::int AS total
    FROM client_support_tickets
    GROUP BY ticket_code
    HAVING COUNT(*) > 1
    ORDER BY total DESC, ticket_code
  `);

  const { rows: seq } = await client.query(`
    SELECT last_value FROM support_ticket_code_seq
  `);

  console.log("OK: migración 063 aplicada (código ticket soporte único global).");
  console.log("Índice único global:", idx.length ? idx[0].indexname : "(no encontrado)");
  console.log(
    "Función RPC:",
    fn.length ? "next_support_ticket_code" : "(no encontrada)",
  );
  console.log("Secuencia last_value:", seq[0]?.last_value ?? "(n/a)");
  console.log("Duplicados restantes:", dups.length);
  if (dups.length) {
    console.log(dups);
    process.exit(1);
  }
} finally {
  await client.end();
}
