import "dotenv/config";
import { env } from "../src/config/env.js";
import {
  createSupabaseClient,
  maskSecret,
  normalizeSupabaseUrl,
} from "../src/database/supabase-factory.js";
import { formatSupabaseError } from "../src/utils/supabase-errors.js";

async function probeTable(
  label: string,
  table: string,
): Promise<void> {
  const supabase = createSupabaseClient(
    env.supabase.url,
    env.supabase.serviceRoleKey,
  );

  console.log(`\n  --- ${label} ---`);
  console.log(`  Query: supabase.from('${table}').select('id').limit(1)`);

  const { data, error } = await supabase.from(table).select("id").limit(1);

  if (error) {
    console.log("  Resultado: ERROR");
    console.log(`  code:    ${error.code ?? "(sin code)"}`);
    console.log(`  message: ${error.message}`);
    console.log(`  details: ${error.details ?? "(sin details)"}`);
    console.log(`  hint:    ${error.hint ?? "(sin hint)"}`);
    console.log(`  full:    ${formatSupabaseError(error)}`);
    return;
  }

  console.log("  Resultado: OK");
  console.log(`  rows: ${data?.length ?? 0}`);
  if (data && data.length > 0) {
    console.log(`  sample: ${JSON.stringify(data[0])}`);
  }
}

async function main(): Promise<void> {
  const rawUrl = (process.env.SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  console.log("");
  console.log("  Debug Supabase — Telvoice SMS Agent (supabase-js)");
  console.log("");

  console.log(`  SUPABASE_URL (raw):        ${rawUrl || "(vacío)"}`);
  console.log(
    `  SUPABASE_URL (normalizada): ${normalizeSupabaseUrl(rawUrl) || "(vacío)"}`,
  );
  console.log(
    `  env.supabase.url en uso:    ${env.supabase.url || "(vacío)"}`,
  );
  console.log(
    `  SERVICE_ROLE_KEY:           ${key ? maskSecret(key) : "NO CONFIGURADA"}`,
  );

  if (!env.supabase.url || !key) {
    console.log("\n  Completa SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env");
    process.exit(1);
  }

  await probeTable("clients", "clients");
  await probeTable("admin_users", "admin_users");

  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
