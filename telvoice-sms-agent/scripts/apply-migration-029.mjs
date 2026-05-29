#!/usr/bin/env node
/**
 * Aplica 029_client_support_tickets.sql vía DATABASE_URL (.env).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  __dirname,
  "../supabase/migrations/029_client_support_tickets.sql",
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
    WHERE schemaname = 'public' AND tablename = 'client_support_tickets'
    ORDER BY indexname
  `);
  console.log("OK: migración 029 aplicada (client_support_tickets).");
  console.log("Índices:", rows.map((r) => r.indexname).join(", "));
} finally {
  await client.end();
}
