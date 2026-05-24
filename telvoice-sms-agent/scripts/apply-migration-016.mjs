#!/usr/bin/env node
/**
 * Aplica 016_sms_traffic_controls.sql vía DATABASE_URL (.env).
 * Idempotente: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS.
 * Uso: node scripts/apply-migration-016.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  __dirname,
  "../supabase/migrations/016_sms_traffic_controls.sql",
);

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error(
    "ERROR: DATABASE_URL no está definido. Configure .env (sin imprimir el valor).",
  );
  process.exit(1);
}

const sql = readFileSync(sqlPath, "utf8");

if (/\bDROP\s+TABLE\b/i.test(sql)) {
  console.error("ERROR: revisión previa — la migración no debe contener DROP TABLE.");
  process.exit(1);
}
if (/\bENABLE\s+ROW\s+LEVEL\s+SECURITY\b/i.test(sql)) {
  console.error("ERROR: revisión previa — la migración no debe activar RLS.");
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

console.log("Conectando a:", maskHost(connectionString));
console.log("Archivo:", "016_sms_traffic_controls.sql");

await client.connect();
try {
  await client.query(sql);

  const columnChecks = [
    {
      table: "sms_providers",
      cols: [
        "max_tps",
        "max_concurrent_requests",
        "daily_limit",
        "monthly_limit",
        "failure_threshold_percent",
        "auto_pause_on_failure",
      ],
    },
    {
      table: "sms_routes",
      cols: [
        "max_tps",
        "max_concurrent_requests",
        "daily_limit",
        "failure_threshold_percent",
        "auto_pause_on_failure",
      ],
    },
    {
      table: "sms_rate_plans",
      cols: ["default_tps", "daily_limit", "monthly_limit"],
    },
    {
      table: "company_rate_plans",
      cols: [
        "max_tps",
        "daily_limit",
        "monthly_limit",
        "live_enabled",
        "campaigns_enabled",
        "api_enabled",
      ],
    },
  ];

  for (const { table, cols } of columnChecks) {
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = ANY($2::text[])
       ORDER BY column_name`,
      [table, cols],
    );
    const found = rows.map((r) => r.column_name);
    const missing = cols.filter((c) => !found.includes(c));
    if (missing.length) {
      throw new Error(`Faltan columnas en ${table}: ${missing.join(", ")}`);
    }
    console.log(`✓ ${table}: ${found.join(", ")}`);
  }

  const { rows: tables } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('sms_send_queue', 'sms_tps_counters')
    ORDER BY 1`);
  const tableNames = tables.map((r) => r.table_name);
  if (!tableNames.includes("sms_send_queue") || !tableNames.includes("sms_tps_counters")) {
    throw new Error(
      `Faltan tablas nuevas. Encontradas: ${tableNames.join(", ") || "ninguna"}`,
    );
  }
  console.log("✓ Tablas:", tableNames.join(", "));

  const { rows: cap } = await client.query(`
    SELECT pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'company_rate_plans'::regclass
      AND conname = 'company_rate_plans_max_tps_cap'`);
  if (!cap.length || !String(cap[0].def).includes("<= (20)")) {
    throw new Error("Constraint company_rate_plans_max_tps_cap (max 20) no encontrado");
  }
  console.log("✓ Constraint max_tps cliente:", cap[0].def);

  const { rows: defaults } = await client.query(`
    SELECT column_name, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'company_rate_plans'
      AND column_name IN ('live_enabled', 'campaigns_enabled', 'api_enabled')
    ORDER BY column_name`);
  for (const row of defaults) {
    const def = String(row.column_default ?? "");
    if (!def.includes("false")) {
      console.warn(`⚠ ${row.column_name} default inesperado: ${def}`);
    } else {
      console.log(`✓ ${row.column_name} default false`);
    }
  }

  const { rows: queueCount } = await client.query(
    `SELECT COUNT(*)::int AS n FROM sms_send_queue`,
  );
  console.log(`✓ sms_send_queue filas (sin procesar): ${queueCount[0]?.n ?? 0}`);

  try {
    await client.query(
      `UPDATE company_rate_plans SET max_tps = 25 WHERE false`,
    );
  } catch {
    /* esperado si constraint activo */
  }
  const probe = await client.query(`
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'company_rate_plans'::regclass
      AND conname = 'company_rate_plans_max_tps_cap'
  `);
  if (!probe.rows.length) {
    throw new Error("No se pudo verificar constraint max_tps");
  }

  console.log("\nMigración 016 aplicada correctamente.");
  console.log("Resumen: columnas TPS/límites, cola sms_send_queue, contadores sms_tps_counters.");
  console.log("Siguiente: node scripts/verify-traffic-controls-qa.mjs");
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
