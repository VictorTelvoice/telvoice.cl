import type { Request, Response } from "express";
import { processInboundSmsWebhook } from "../services/inboundSmsService.js";

export async function inboundSmsWebhookHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const body = req.body ?? {};
    const result = await processInboundSmsWebhook({
      to: String(body.to ?? ""),
      from: body.from != null ? String(body.from) : undefined,
      body: String(body.body ?? ""),
      received_at:
        body.received_at != null ? String(body.received_at) : undefined,
      provider: body.provider != null ? String(body.provider) : undefined,
    });

    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.error });
      return;
    }

    res.status(201).json({ ok: true, message_id: result.messageId });
  } catch {
    res.status(500).json({ ok: false, error: "Error al procesar SMS entrante." });
  }
}
