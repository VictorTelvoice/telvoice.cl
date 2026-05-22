import axios, { type AxiosInstance, isAxiosError } from "axios";
import { env } from "../../config/env.js";
import type {
  TelegramApiResult,
  TelegramBotInfo,
  TelegramUpdate,
} from "../../types/telegram.js";
import { AppError } from "../../utils/errors.js";

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
  ): Promise<{ message_id: number }> {
    return this.post<{ message_id: number }>("sendMessage", {
      chat_id: chatId,
      text,
    });
  }

  async setWebhook(
    url: string,
    secretToken?: string,
  ): Promise<boolean> {
    return this.post<boolean>("setWebhook", {
      url,
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
      allowed_updates: ["message"],
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
