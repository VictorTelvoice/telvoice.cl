import { createApp } from "./app.js";
import { setBootstrapWarning } from "./config/bootstrap-status.js";
import { env } from "./config/env.js";
import { ensureTestClientSetup } from "./services/clientService.js";
import { startTelegramPollingIfEnabled } from "./services/telegramPolling.js";
import { DatabaseError } from "./utils/errors.js";
import {
  formatSupabaseError,
  isPgrestSchemaCacheError,
} from "./utils/supabase-errors.js";

async function bootstrap(): Promise<void> {
  if (!env.supabase.url || !env.supabase.serviceRoleKey) {
    setBootstrapWarning(
      "Supabase no configurado. Completa SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.",
    );
    console.warn(
      "[bootstrap] Supabase no configurado. Persistencia deshabilitada.",
    );
    return;
  }

  try {
    const bundle = await ensureTestClientSetup();
    console.info(
      `[bootstrap] Cliente de prueba listo: ${bundle.client.company_name} (${bundle.client.id})`,
    );
  } catch (error) {
    const details =
      error instanceof DatabaseError && error.details
        ? (error.details as { code?: string; message?: string })
        : null;
    const code = details?.code ?? "";
    const message = error instanceof Error ? error.message : String(error);
    const pgrest = isPgrestSchemaCacheError({ code, message });

    if (pgrest) {
      const warning =
        "PostgREST (PGRST205) no ve las tablas en schema cache. " +
        "Ejecuta: npm run debug:supabase && npm run debug:supabase-rest. " +
        "En Supabase SQL: NOTIFY pgrst, 'reload schema';";
      setBootstrapWarning(warning, true);
      console.warn(`[bootstrap] ${warning}`);
      if (details) {
        console.warn(`[bootstrap] ${formatSupabaseError(details as Parameters<typeof formatSupabaseError>[0])}`);
      }
    } else {
      setBootstrapWarning(
        `Error al inicializar cliente de prueba: ${message}`,
      );
      console.error("[bootstrap] Error al inicializar cliente de prueba:", error);
    }
  }
}

const app = createApp();

await bootstrap();

app.listen(env.port, () => {
  console.info(
    `Telvoice SMS Agent escuchando en http://localhost:${env.port}`,
  );
  console.info(`Health: http://localhost:${env.port}/health`);
  console.info(`Admin:  ${env.publicAppUrl}/admin`);
  console.info(`Login:  ${env.publicAppUrl}/admin/login`);

  if (env.telegram.botToken) {
    console.info(`Telegram: modo ${env.telegram.mode}`);
    startTelegramPollingIfEnabled();
  } else {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN no configurado — bot deshabilitado.");
  }
});
