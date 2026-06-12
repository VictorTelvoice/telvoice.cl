import type { Request, Response } from "express";
import { env } from "../config/env.js";
import {
  processInboundSmsWebhook,
  type InboundSmsWebhookPayload,
} from "../services/inboundSmsService.js";
import { AppError } from "../utils/errors.js";

function headerString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return value?.trim() ?? "";
}

function validateInboundWebhookSecret(req: Request): void {
  const expected = env.numeracionesInbound.webhookSecret?.trim();
  if (!expected) return;

  const provided =
    headerString(req.headers["x-telvoice-inbound-secret"]) ||
    headerString(req.headers.authorization).replace(/^Bearer\s+/i, "");

  if (provided !== expected) {
    throw new AppError("Webhook inbound no autorizado.", 401);
  }
}

function parseInboundBody(body: Record<string, unknown>): InboundSmsWebhookPayload {
  const textBody = String(body.body ?? body.text ?? body.content ?? "").trim();
  return {
    to: String(body.to ?? body.to_number ?? body.line_phone ?? ""),
    from:
      body.from != null
        ? String(body.from)
        : body.from_number != null
          ? String(body.from_number)
          : undefined,
    body: textBody,
    text: textBody,
    received_at:
      body.received_at != null
        ? String(body.received_at)
        : body.receivedAt != null
          ? String(body.receivedAt)
          : undefined,
    provider: body.provider != null ? String(body.provider) : undefined,
    provider_message_id:
      body.provider_message_id != null
        ? String(body.provider_message_id)
        : body.message_id != null
          ? String(body.message_id)
          : undefined,
  };
}

async function handleInboundSmsWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  validateInboundWebhookSecret(req);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const payload = parseInboundBody(body);
  const result = await processInboundSmsWebhook(payload);

  if (!result.ok) {
    res.status(result.error?.includes("no encontrada") ? 404 : 400).json({
      ok: false,
      error: result.error,
    });
    return;
  }

  res.status(201).json({ ok: true, message_id: result.messageId });
}

export async function inboundSmsWebhookHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    await handleInboundSmsWebhook(req, res);
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ ok: false, error: error.message });
      return;
    }
    res.status(500).json({ ok: false, error: "Error al procesar SMS entrante." });
  }
}

/** Alias documentado: POST /api/webhooks/numeraciones/inbound */
export async function numeracionesInboundWebhookHandler(
  req: Request,
  res: Response,
): Promise<void> {
  return inboundSmsWebhookHandler(req, res);
}
