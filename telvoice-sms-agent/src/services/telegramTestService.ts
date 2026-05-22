import { telegramClient } from "../providers/telegram/index.js";
import type { ClientTelegramUserRow } from "../types/database.js";
import { AppError } from "../utils/errors.js";
import { setTelegramLastError } from "./telegram/runtime.js";

export const TELEGRAM_CONNECTION_TEST_MESSAGE =
  "✅ Telvoice SMS Agent conectado correctamente. Tu usuario Telegram está autorizado para PRUEBA_TELVOICE.";

export function resolveTelegramChatId(user: ClientTelegramUserRow): number {
  const chatRaw = user.telegram_chat_id?.trim();
  if (chatRaw && /^\d+$/.test(chatRaw)) {
    return Number.parseInt(chatRaw, 10);
  }
  return Number.parseInt(user.telegram_user_id, 10);
}

export async function sendTelegramTestToChatId(
  chatId: number | string,
  text: string = TELEGRAM_CONNECTION_TEST_MESSAGE,
): Promise<{ message_id: number }> {
  if (!telegramClient) {
    throw new AppError(
      "TELEGRAM_BOT_TOKEN no configurado.",
      503,
      "TELEGRAM_NOT_CONFIGURED",
    );
  }

  try {
    const result = await telegramClient.sendMessage(chatId, text);
    setTelegramLastError(null);
    return result;
  } catch (error) {
    const msg =
      error instanceof AppError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Error al enviar mensaje Telegram";
    setTelegramLastError(msg);
    throw error;
  }
}

export async function sendTelegramTestToUser(
  user: ClientTelegramUserRow,
): Promise<{ chat_id: number; message_id: number }> {
  const chatId = resolveTelegramChatId(user);
  const result = await sendTelegramTestToChatId(chatId);
  return { chat_id: chatId, message_id: result.message_id };
}
