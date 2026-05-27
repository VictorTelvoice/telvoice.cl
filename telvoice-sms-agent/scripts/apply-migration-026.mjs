#!/usr/bin/env node
/**
 * Aplica 026_user_profiles_upsert_unique.sql vía DATABASE_URL (.env).
 * Comprueba duplicados antes de migrar; no borra datos.
 * Uso: npm run migrate:026
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  __dirname,
  "../supabase/migrations/026_user_profiles_upsert_unique.sql",
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
  const dupUser = await client.query(`
    SELECT user_id, COUNT(*)::int AS c
    FROM public.user_profiles
    WHERE user_id IS NOT NULL
    GROUP BY user_id
    HAVING COUNT(*) > 1
  `);
  const dupAdmin = await client.query(`
    SELECT admin_user_id, COUNT(*)::int AS c
    FROM public.user_profiles
    WHERE admin_user_id IS NOT NULL
    GROUP BY admin_user_id
    HAVING COUNT(*) > 1
  `);

  console.log("Duplicados user_id:", dupUser.rows.length);
  if (dupUser.rows.length) {
    console.error(JSON.stringify(dupUser.rows, null, 2));
    console.error(
      "ABORT: resuelve duplicados en user_profiles.user_id antes de migrar.",
    );
    process.exit(1);
  }

  console.log("Duplicados admin_user_id:", dupAdmin.rows.length);
  if (dupAdmin.rows.length) {
    console.error(JSON.stringify(dupAdmin.rows, null, 2));
    console.error(
      "ABORT: resuelve duplicados en user_profiles.admin_user_id antes de migrar.",
    );
    process.exit(1);
  }

  const sql = readFileSync(sqlPath, "utf8");
  await client.query(sql);

  const { rows } = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'user_profiles'
      AND indexname IN (
        'user_profiles_admin_user_id_unique',
        'user_profiles_user_id_unique'
      )
    ORDER BY indexname
  `);

  console.log("OK: migración 026 aplicada.");
  console.log("Índices:", rows.map((r) => r.indexname).join(", ") || "(ninguno)");
  console.log("OK: pg_notify('pgrst', 'reload schema') enviado.");
} catch (err) {
  console.error("ERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end();
}
