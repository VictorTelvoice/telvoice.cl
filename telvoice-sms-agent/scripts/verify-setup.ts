import "dotenv/config";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../src/config/env.js";
import { getSupabase, resetSupabaseClientForTests } from "../src/database/supabaseClient.js";
import {
  formatSupabaseError,
  isPgrestSchemaCacheError,
} from "../src/utils/supabase-errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const envPath = resolve(projectRoot, ".env");

const PLACEHOLDERS = {
  supabaseKey: "PEGAR_SERVICE_ROLE_KEY_DE_SUPABASE",
  asmscPassword: "PEGAR_PASSWORD_API_ASMSC",
  superadminPassword: "CREAR_PASSWORD_SUPERADMIN",
} as const;

/** Misma forma de acceso que usan los servicios (PostgREST vía supabase-js). */
const REQUIRED_TABLES = [
  "clients",
  "client_sms_accounts",
  "balances",
  "balance_ledger",
  "sms_messages",
  "sms_dlr_events",
  "admin_users",
  "client_telegram_users",
  "knowledge_articles",
  "sms_products",
  "public_leads",
  "sms_pricing_tiers",
] as const;

const CRITICAL_TABLES = ["clients", "admin_users"] as const;

type CheckResult = { ok: boolean; message: string; detail?: string };

function envValue(name: string): string {
  return (process.env[name] ?? "").trim();
}

function isMissing(value: string): boolean {
  return value.length === 0;
}

function isPlaceholder(value: string, placeholder: string): boolean {
  return value === placeholder || value.includes("PEGAR_") || value.includes("CREAR_");
}

function printResult(result: CheckResult): void {
  const prefix = result.ok ? "OK:" : "ERROR:";
  console.log(`  ${prefix} ${result.message}`);
  if (result.detail) {
    console.log(`       ${result.detail}`);
  }
}

async function probeTableReal(
  table: string,
): Promise<CheckResult> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from(table).select("id").limit(1);

  if (error) {
    const detail = formatSupabaseError(error);

    if (isPgrestSchemaCacheError(error)) {
      return {
        ok: false,
        message: `from('${table}').select('id') — PostgREST no ve la tabla (schema cache)`,
        detail,
      };
    }

    return {
      ok: false,
      message: `from('${table}').select('id') falló`,
      detail,
    };
  }

  const countNote =
    data && data.length > 0 ? "con filas" : "sin filas (tabla accesible)";
  return {
    ok: true,
    message: `from('${table}').select('id').limit(1) — ${countNote}`,
  };
}

async function main(): Promise<void> {
  console.log("");
  console.log("  Verificación de configuración — Telvoice SMS Agent");
  console.log("  (mismo cliente Supabase que seed:admin y los servicios)");
  console.log("");

  let hasErrors = false;

  if (!existsSync(envPath)) {
    printResult({
      ok: false,
      message: "No existe .env — ejecuta: npm run setup:env",
    });
    console.log("");
    process.exit(1);
  }

  printResult({ ok: true, message: ".env encontrado" });

  const checks: Array<{ name: string; value: string; placeholder?: string }> = [
    { name: "SUPABASE_URL", value: envValue("SUPABASE_URL") },
    {
      name: "SUPABASE_SERVICE_ROLE_KEY",
      value: envValue("SUPABASE_SERVICE_ROLE_KEY"),
      placeholder: PLACEHOLDERS.supabaseKey,
    },
    { name: "ASMSC_API_ID", value: envValue("ASMSC_API_ID") },
    {
      name: "ASMSC_API_PASSWORD",
      value: envValue("ASMSC_API_PASSWORD"),
      placeholder: PLACEHOLDERS.asmscPassword,
    },
    { name: "SUPERADMIN_EMAIL", value: envValue("SUPERADMIN_EMAIL") },
    {
      name: "SUPERADMIN_PASSWORD",
      value: envValue("SUPERADMIN_PASSWORD"),
      placeholder: PLACEHOLDERS.superadminPassword,
    },
    { name: "JWT_SECRET", value: envValue("JWT_SECRET") },
    { name: "SESSION_SECRET", value: envValue("SESSION_SECRET") },
  ];

  for (const check of checks) {
    if (isMissing(check.value)) {
      printResult({ ok: false, message: `Falta ${check.name} en .env` });
      hasErrors = true;
      continue;
    }

    if (check.placeholder && isPlaceholder(check.value, check.placeholder)) {
      printResult({
        ok: false,
        message: `${check.name} todavía tiene el valor de ejemplo — edita .env`,
      });
      hasErrors = true;
      continue;
    }

    printResult({ ok: true, message: `${check.name} configurado` });
  }

  const supabaseKey = envValue("SUPABASE_SERVICE_ROLE_KEY");

  if (
    !hasErrors &&
    env.supabase.url &&
    supabaseKey &&
    !isPlaceholder(supabaseKey, PLACEHOLDERS.supabaseKey)
  ) {
    resetSupabaseClientForTests();
    printResult({
      ok: true,
      message: `SUPABASE_URL en uso: ${env.supabase.url}`,
    });

    console.log("");
    console.log("  Pruebas PostgREST (select id limit 1):");
    console.log("");

    let schemaCacheIssue = false;

    for (const table of CRITICAL_TABLES) {
      const result = await probeTableReal(table);
      printResult(result);
      if (!result.ok) {
        hasErrors = true;
        if (result.detail?.includes("PGRST205")) {
          schemaCacheIssue = true;
        }
      }
    }

    for (const table of REQUIRED_TABLES) {
      if ((CRITICAL_TABLES as readonly string[]).includes(table)) {
        continue;
      }
      const result = await probeTableReal(table);
      printResult(result);
      if (!result.ok) {
        hasErrors = true;
        if (result.detail?.includes("PGRST205")) {
          schemaCacheIssue = true;
        }
      }
    }

    if (!hasErrors) {
      printResult({ ok: true, message: "Supabase conectado (mismo método que seed:admin)" });
      printResult({ ok: true, message: "Todas las tablas accesibles vía PostgREST" });
    } else if (schemaCacheIssue) {
      printResult({
        ok: false,
        message:
          "PGRST205: tablas existen en PostgreSQL pero PostgREST no las ve aún",
        detail:
          "Ejecuta: npm run debug:supabase && npm run debug:supabase-rest. En Supabase SQL: NOTIFY pgrst, 'reload schema';",
      });
    } else {
      printResult({
        ok: false,
        message: "Migraciones o permisos — ejecuta supabase/setup_all.sql",
      });
    }
  }

  console.log("");

  if (hasErrors) {
    console.log("  Hay errores. Diagnóstico:");
    console.log("    npm run debug:supabase");
    console.log("    npm run debug:supabase-rest");
    console.log("");
    process.exit(1);
  }

  console.log("  ¡Todo listo! Puedes ejecutar:");
  console.log("    npm run seed:admin");
  console.log("    npm run dev");
  console.log("");
  process.exit(0);
}

main().catch((error) => {
  console.error("  ERROR:", error);
  process.exit(1);
});
