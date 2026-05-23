import type { Request, Response } from "express";
import { routeMercadoPagoWebhook } from "../services/mercadoPagoWebhookService.js";

function extractPaymentId(req: Request): string | null {
  const q = req.query as Record<string, string | undefined>;
  if (q.topic === "payment" && q.id) {
    return String(q.id);
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (body.type === "payment" && body.data && typeof body.data === "object") {
    const id = (body.data as { id?: string | number }).id;
    if (id != null) {
      return String(id);
    }
  }
  if (body.topic === "payment" && body.id) {
    return String(body.id);
  }
  return null;
}

export async function mercadoPagoWebhookHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  const paymentId = extractPaymentId(req);
  if (!paymentId) {
    res.status(200).json({ ok: true, skipped: "no_payment_id" });
    return;
  }

  try {
    const outcome = await routeMercadoPagoWebhook(paymentId);
    res.status(200).json(outcome);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("duplicate key")) {
      console.error("[mp-webhook] error", error);
    } else {
      console.log("[mp-webhook] duplicate ignored (idempotente)", paymentId);
    }
    res.status(200).json({ ok: true, error: "logged" });
  }
}
