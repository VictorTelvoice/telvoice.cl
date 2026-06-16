#!/usr/bin/env node
/**
 * Auditoría read-only: migraciones 059+ y tabla sim_subscriptions.
 * No aplica cambios en DB.
 */
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase/migrations");

const PROTECTED_SUFFIXES = new Set(["030", "021", "513"]);

function listMigrationFiles() {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function migrationNumber(name) {
  const m = name.match(/^(\d+)_/);
  return m ? Number.parseInt(m[1], 10) : null;
}

async function main() {
  const files = listMigrationFiles();
  const byNumber = new Map();
  for (const f of files) {
    const n = migrationNumber(f);
    if (n == null) continue;
    if (!byNumber.has(n)) byNumber.set(n, []);
    byNumber.get(n).push(f);
  }

  const dupes = [...byNumber.entries()].filter(([, arr]) => arr.length > 1);
  const range059 = files.filter((f) => {
    const n = migrationNumber(f);
    return n != null && n >= 59 && n <= 65;
  });

  console.log("=== Auditoría migraciones SIM suscripción ===\n");
  console.log("Migraciones 059–065 en repo:");
  for (const f of range059) {
    console.log(`  - ${f}`);
  }
  console.log("");

  if (dupes.length) {
    console.log("⚠️  Duplicidad numérica detectada:");
    for (const [n, arr] of dupes) {
      console.log(`  ${String(n).padStart(3, "0")}: ${arr.join(", ")}`);
    }
  } else {
    console.log("✓ Sin duplicidad numérica en migraciones del repo");
  }

  const has060Agent = files.some((f) => f.includes("060_agent_inbound"));
  const has060Sim = files.some((f) => f.includes("060_sim_subscriptions"));
  console.log("");
  console.log(`060_agent_inbound_sms_knowledge.sql en repo: ${has060Agent ? "SÍ" : "NO"}`);
  console.log(`060_sim_subscriptions.sql en repo: ${has060Sim ? "SÍ" : "NO"}`);

  if (!process.env.DATABASE_URL) {
    console.log("\n⚠️  DATABASE_URL no configurada — omitiendo consulta Supabase");
    process.exit(dupes.length ? 1 : 0);
  }

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const table = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'sim_subscriptions'
      ) AS exists
    `);
    const simTableExists = table.rows[0]?.exists === true;
    console.log(`\nsim_subscriptions en Supabase: ${simTableExists ? "EXISTE" : "NO EXISTE"}`);

    if (simTableExists) {
      const cols = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sim_subscriptions'
        ORDER BY ordinal_position
      `);
      console.log(`  columnas: ${cols.rows.length}`);
      const required = [
        "order_id",
        "mercadopago_preapproval_id",
        "status",
        "next_billing_date",
        "last_payment_id",
        "last_credit_at",
      ];
      const present = new Set(cols.rows.map((r) => r.column_name));
      const missing = required.filter((c) => !present.has(c));
      if (missing.length) {
        console.log(`  ⚠️  columnas faltantes: ${missing.join(", ")}`);
      } else {
        console.log("  ✓ columnas mínimas presentes");
      }

      const counts = await client.query(`
        SELECT status, count(*)::int AS c
        FROM sim_subscriptions
        GROUP BY status
        ORDER BY status
      `);
      console.log("  filas por status:", counts.rows.length ? counts.rows : "(vacía)");
    }

    const inv = await client.query(`
      SELECT right(regexp_replace(e164_number, '[^0-9]', '', 'g'), 3) AS suffix,
             sales_status,
             current_order_id IS NOT NULL AS reserved
      FROM real_number_inventory
      WHERE right(regexp_replace(e164_number, '[^0-9]', '', 'g'), 3) = ANY($1::text[])
      ORDER BY suffix
    `, [[...PROTECTED_SUFFIXES]]);

    console.log("\nInventario protegido (solo sufijos):");
    for (const row of inv.rows) {
      console.log(
        `  ***${row.suffix}: ${row.sales_status}${row.reserved ? " (reservado)" : ""}`,
      );
    }

    const qaAvail = await client.query(`
      SELECT id,
             right(regexp_replace(e164_number, '[^0-9]', '', 'g'), 3) AS suffix,
             sales_status
      FROM real_number_inventory
      WHERE sales_status = 'connected_available'
        AND webhook_connected = true
        AND right(regexp_replace(e164_number, '[^0-9]', '', 'g'), 3) <> ALL($1::text[])
      ORDER BY created_at ASC
      LIMIT 3
    `, [[...PROTECTED_SUFFIXES]]);

    console.log(`\nInventario QA disponible (excl. 030/021/513): ${qaAvail.rows.length} fila(s)`);
    for (const row of qaAvail.rows) {
      console.log(`  id=${row.id} suffix=***${row.suffix} status=${row.sales_status}`);
    }
  } finally {
    await client.end();
  }

  console.log("\n=== Fin auditoría (read-only) ===");
}

main().catch((err) => {
  console.error("FAIL audit", err);
  process.exit(1);
});
