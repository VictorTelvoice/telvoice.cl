import axios, { type AxiosInstance, isAxiosError } from "axios";
import { env } from "../../config/env.js";
import type {
  TelegramApiResult,
  TelegramBotInfo,
  TelegramUpdate,
} from "../../types/telegram.js";
import { AppError } from "../../utils/errors.js";

export type InlineKeyboardButton = {
  text: string;
  url?: string;
  callback_data?: string;
};

export type InlineKeyboardMarkup = {
  inline_keyboard: InlineKeyboardButton[][];
};

export interface SendMessageOptions {
  reply_markup?: InlineKeyboardMarkup;
  disable_web_page_preview?: boolean;
}

export class TelegramClient {
  private readonly http: AxiosInstance;

  constructor(botToken: string) {
    this.http = axios.create({
      baseURL: `https://api.telegram.org/bot${botToken}`,
      timeout: 35_000,
      headers: { "Content-Type": "application/json" },
    });
  }

  async sendMessage(
    chatId: number | string,
    text: string,
    options?: SendMessageOptions,
  ): Promise<{ message_id: number }> {
    return this.post<{ message_id: number }>("sendMessage", {
      chat_id: chatId,
      text,
      ...(options?.reply_markup
        ? { reply_markup: options.reply_markup }
        : {}),
      ...(options?.disable_web_page_preview
        ? { disable_web_page_preview: true }
        : {}),
    });
  }

  async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
  ): Promise<boolean> {
    return this.post<boolean>("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...(text ? { text, show_alert: false } : {}),
    });
  }

  async setWebhook(
    url: string,
    secretToken?: string,
  ): Promise<boolean> {
    return this.post<boolean>("setWebhook", {
      url,
      allowed_updates: ["message", "callback_query"],
      ...(secretToken ? { secret_token: secretToken } : {}),
    });
  }

  async deleteWebhook(): Promise<boolean> {
    return this.post<boolean>("deleteWebhook", { drop_pending_updates: false });
  }

  async getMe(): Promise<TelegramBotInfo> {
    return this.post<TelegramBotInfo>("getMe", {});
  }

  async getUpdates(offset?: number): Promise<TelegramUpdate[]> {
    return this.post<TelegramUpdate[]>("getUpdates", {
      offset,
      timeout: 25,
      limit: 50,
      allowed_updates: ["message", "callback_query"],
    });
  }

  private async post<T>(method: string, body: Record<string, unknown>): Promise<T> {
    try {
      const { data } = await this.http.post<TelegramApiResult<T>>(method, body);

      if (!data.ok) {
        throw new AppError(
          data.description ?? `Error Telegram API (${method})`,
          502,
          "TELEGRAM_API_ERROR",
        );
      }

      return data.result as T;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      const message = isAxiosError(error)
        ? error.response?.data &&
          typeof error.response.data === "object" &&
          "description" in error.response.data
          ? String(
              (error.response.data as { description?: string }).description,
            )
          : error.message
        : error instanceof Error
          ? error.message
          : "Error desconocido Telegram API";

      throw new AppError(message, 502, "TELEGRAM_API_ERROR");
    }
  }
}

export function createTelegramClient(): TelegramClient | null {
  const token = env.telegram.botToken;
  if (!token) {
    return null;
  }
  return new TelegramClient(token);
}
