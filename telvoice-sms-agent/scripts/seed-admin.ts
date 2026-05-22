import "dotenv/config";
import {
  assertAdminAuthConfig,
  assertSupabaseCredentials,
  assertSuperadminSeedConfig,
  env,
} from "../src/config/env.js";
import { getSupabase } from "../src/database/supabaseClient.js";
import { seedSuperadminIfMissing } from "../src/services/adminAuthService.js";
import { DatabaseError } from "../src/utils/errors.js";
import {
  formatSupabaseError,
  isPgrestSchemaCacheError,
} from "../src/utils/supabase-errors.js";

function printPgrest205Help(): void {
  console.error("");
  console.error(
    "  PostgREST no está viendo la tabla admin_users aunque exista en PostgreSQL.",
  );
  console.error(
    "  Ejecuta npm run debug:supabase y npm run debug:supabase-rest para comparar.",
  );
  console.error("");
  console.error("  En Supabase SQL Editor prueba también:");
  console.error("    NOTIFY pgrst, 'reload schema';");
  console.error("");
  console.error("  Verifica Project Settings → API → Exposed schemas incluye public.");
  console.error("");
}

async function main(): Promise<void> {
  assertSupabaseCredentials();
  assertAdminAuthConfig();
  assertSuperadminSeedConfig();

  getSupabase();

  const result = await seedSuperadminIfMissing({
    email: env.admin.superadminEmail,
    password: env.admin.superadminPassword,
    name: env.admin.superadminName,
  });

  if (result.created) {
    console.info(`[seed:admin] Superadmin creado: ${result.email}`);
  } else {
    console.info(`[seed:admin] Superadmin ya existía: ${result.email}`);
  }
}

main().catch((error) => {
  console.error("[seed:admin] Error:", error);

  const details =
    error instanceof DatabaseError && error.details
      ? (error.details as { code?: string; message?: string })
      : null;

  const code =
    details?.code ??
    (error as { code?: string }).code ??
    "";

  const message =
    error instanceof Error ? error.message : String(error);

  if (
    isPgrestSchemaCacheError({ code, message }) ||
    message.includes("PGRST205") ||
    message.includes("schema cache")
  ) {
    printPgrest205Help();
    if (details) {
      console.error(`  Detalle: ${formatSupabaseError(details as Parameters<typeof formatSupabaseError>[0])}`);
    }
  }

  process.exit(1);
});
