#!/usr/bin/env node
/**
 * Aplica 025_platform_runtime_settings.sql vía DATABASE_URL (.env).
 * Uso: npm run migrate:025
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  __dirname,
  "../supabase/migrations/025_platform_runtime_settings.sql",
);

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("ERROR: DATABASE_URL no está definido.");
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
  const { rows } = await client.query(
    `SELECT key FROM platform_runtime_settings LIMIT 1`,
  );
  console.log(
    "OK: migración 025 aplicada (platform_runtime_settings).",
    rows.length ? "Tabla accesible." : "Tabla vacía (listo para overrides).",
  );
} catch (err) {
  console.error("ERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end();
}
