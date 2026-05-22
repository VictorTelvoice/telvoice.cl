import "dotenv/config";
import { env } from "../src/config/env.js";
import { createTelegramClient } from "../src/providers/telegram/telegramClient.js";

async function main(): Promise<void> {
  const token = env.telegram.botToken;
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN no está configurado en .env");
    process.exit(1);
  }

  const client = createTelegramClient();
  if (!client) {
    console.error("No se pudo crear el cliente Telegram.");
    process.exit(1);
  }

  try {
    const me = await client.getMe();
    console.log("");
    console.log("  Bot Telegram conectado correctamente");
    console.log(`  ID:       ${me.id}`);
    console.log(`  Nombre:   ${me.first_name}`);
    console.log(`  Username: @${me.username ?? "(sin username)"}`);
    console.log(`  Modo env: ${env.telegram.mode}`);
    console.log(
      `  Usuarios: ${env.telegram.allowedUserIds || "(ninguno — configura TELEGRAM_ALLOWED_USER_IDS)"}`,
    );
    console.log("");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Error al llamar getMe:", msg);
    process.exit(1);
  }
}

main();
