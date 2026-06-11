/**
 * Validación read-only del schema post-migración 059.
 * Solo SELECT sobre information_schema y pg_indexes. No modifica datos.
 *
 * Uso: npm run validate:migration-059-schema
 */
import { createPgClient } from "../src/database/pgClient.js";

const READ_ONLY_SQL = /^\s*(SELECT|WITH)\b/i;

function assertReadOnly(sql: string): void {
  if (!READ_ONLY_SQL.test(sql)) {
    throw new Error(`Solo consultas SELECT permitidas: ${sql.slice(0, 80)}`);
  }
}

async function main() {
  const c = createPgClient();
  await c.connect();
  try {
    const colsSql = `
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_action_logs'
    ORDER BY ordinal_position`;
    assertReadOnly(colsSql);
    const cols = await c.query(colsSql);
    console.log("admin_action_logs:");
    for (const r of cols.rows) console.log(`  ${r.column_name}: ${r.data_type}`);

    const archSql = `
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_data_audit_flags'
      AND column_name = 'archived_at'`;
    assertReadOnly(archSql);
    const arch = await c.query(archSql);
    console.log("\narchived_at:", arch.rows[0] ?? "AUSENTE");

    const idxSql = `
    SELECT tablename, indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN ('admin_action_logs', 'admin_data_audit_flags')
    ORDER BY tablename, indexname`;
    assertReadOnly(idxSql);
    const idx = await c.query(idxSql);
    console.log("\nindexes:");
    for (const r of idx.rows) console.log(`  ${r.tablename}: ${r.indexname}`);

    const required = [
      "id",
      "actor_user_id",
      "actor_email",
      "company_id",
      "company_snapshot",
      "action_type",
      "previous_state",
      "new_state",
      "metadata",
      "ip_address",
      "user_agent",
      "created_at",
    ];
    const names = cols.rows.map((r) => String(r.column_name));
    const missing = required.filter((col) => !names.includes(col));
    if (missing.length) {
      console.error("FAIL columnas faltantes:", missing.join(", "));
      process.exit(1);
    }
    if (!arch.rows.length) {
      console.error("FAIL archived_at ausente");
      process.exit(1);
    }
    console.log("\nOK schema migración 059 (read-only)");
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
