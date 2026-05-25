import type { NextFunction, Request, Response } from "express";
import type { RequestWithRawBody } from "../types/express-request.js";
import { buildTelsimWebhookUrl } from "../config/env.js";
import { processTelsimSmsWebhook } from "../services/telsimWebhookService.js";
import { AppError } from "../utils/errors.js";

export async function telsimSmsReceivedHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : {};

    const result = await processTelsimSmsWebhook({
      headers: req.headers as Record<string, string | string[] | undefined>,
      body,
      rawBody: (req as RequestWithRawBody).rawBody,
    });

    res.status(200).json({
      ok: true,
      received: true,
      stored: result.stored,
      inbound_id: result.inbound_id,
      slot_id: result.slot_id,
      verification_code: result.verification_code,
    });
  } catch (error) {
    if (error instanceof AppError) {
      if (error.statusCode === 401) {
        console.warn("[telsim] Webhook rechazado:", error.message);
      }
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    next(error);
  }
}

/** Info pública del endpoint (GET) para copiar URL en configuración Telsim. */
export function telsimWebhookInfoHandler(_req: Request, res: Response): void {
  const url = buildTelsimWebhookUrl();
  res.status(200).json({
    ok: true,
    method: "POST",
    webhook_url: url ?? null,
    event: "sms.received",
    headers: ["Content-Type: application/json", "X-Telsim-Signature", "X-Telsim-Event"],
    note: url
      ? "Configura esta URL en telsim.io como Webhook URL (POST)."
      : "Define PUBLIC_WEBHOOK_BASE_URL en el servidor.",
  });
}
