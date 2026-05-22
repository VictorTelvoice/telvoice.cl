import { env } from "../config/env.js";
import { telegramClient } from "../providers/telegram/index.js";
import { processTelegramUpdate } from "./telegramService.js";
import {
  setTelegramBotInfo,
  setTelegramLastError,
  setTelegramPollingActive,
} from "./telegram/runtime.js";

const POLL_ERROR_DELAY_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollingLoop(): Promise<void> {
  const client = telegramClient;
  if (!client) {
    return;
  }

  try {
    await client.deleteWebhook();
    console.info("[telegram] Webhook eliminado (modo polling).");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    setTelegramLastError(msg);
    console.warn("[telegram] No se pudo deleteWebhook:", msg);
  }

  try {
    const me = await client.getMe();
    setTelegramBotInfo(me);
    console.info(
      `[telegram] Bot conectado: @${me.username ?? me.first_name} (id ${me.id})`,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    setTelegramLastError(msg);
    console.error("[telegram] getMe falló:", msg);
  }

  setTelegramPollingActive(true);
  let offset = 0;

  while (true) {
    try {
      const updates = await client.getUpdates(offset > 0 ? offset : undefined);

      for (const update of updates) {
        await processTelegramUpdate(update);
        offset = Math.max(offset, update.update_id + 1);
      }

      setTelegramLastError(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setTelegramLastError(msg);
      console.error("[telegram] Error en polling:", msg);
      await sleep(POLL_ERROR_DELAY_MS);
    }
  }
}

/** Inicia long polling sin bloquear el arranque de Express. */
export function startTelegramPollingIfEnabled(): void {
  if (!env.telegram.botToken) {
    return;
  }

  if (env.telegram.mode !== "polling") {
    console.info(
      `[telegram] Modo ${env.telegram.mode} — polling no iniciado.`,
    );
    return;
  }

  console.info("Telegram polling iniciado");
  void pollingLoop();
}

export async function fetchTelegramBotInfoForDiagnostics(): Promise<void> {
  if (!telegramClient) {
    return;
  }
  try {
    const me = await telegramClient.getMe();
    setTelegramBotInfo(me);
    setTelegramLastError(null);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    setTelegramLastError(msg);
  }
}
