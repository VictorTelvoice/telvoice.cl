import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import type { TelegramUpdate } from "../types/telegram.js";
import { processTelegramUpdate } from "../services/telegramService.js";
import { setTelegramLastError } from "../services/telegram/runtime.js";

export async function telegramWebhookHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const secret = env.telegram.webhookSecret;
    if (secret) {
      const header = req.header("x-telegram-bot-api-secret-token");
      if (header !== secret) {
        res.status(401).json({ ok: false, error: "Invalid secret token" });
        return;
      }
    }

    const body = req.body as TelegramUpdate | { update_id?: number };

    if (body && typeof body === "object" && "update_id" in body) {
      void processTelegramUpdate(body as TelegramUpdate).catch((error) => {
        const msg = error instanceof Error ? error.message : String(error);
        setTelegramLastError(msg);
        console.error("[telegram] Error en webhook update:", error);
      });
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    next(error);
  }
}
