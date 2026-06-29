import type { Request, Response } from "express";
import {
  finalizeMercadoPagoWebhookLog,
  recordMercadoPagoWebhookReceived,
} from "../services/mercadoPagoWebhookAuditService.js";
import { dispatchMercadoPagoWebhook } from "../services/mercadoPagoWebhookDispatchService.js";
import { parseMercadoPagoWebhookRequest } from "../utils/mercadoPagoWebhookRequest.js";

function logStatusFromOutcome(
  outcome: Record<string, unknown>,
): "processed" | "failed" | "skipped" {
  if (outcome.skipped) return "skipped";
  if (outcome.ok === false) return "failed";
  return "processed";
}

export async function mercadoPagoWebhookHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  const parsed = parseMercadoPagoWebhookRequest(req);
  const logId = await recordMercadoPagoWebhookReceived(parsed).catch((error) => {
    console.error("[mp-webhook] audit insert failed", error);
    return null;
  });

  try {
    const outcome = await dispatchMercadoPagoWebhook(parsed);
    await finalizeMercadoPagoWebhookLog(logId, {
      status: logStatusFromOutcome(outcome),
      outcome,
      orderId: outcome.orderId != null ? String(outcome.orderId) : null,
    }).catch((error) => {
      console.error("[mp-webhook] audit finalize failed", error);
    });
    res.status(200).json(outcome);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("duplicate key")) {
      console.error("[mp-webhook] error", error);
    } else {
      console.log("[mp-webhook] duplicate ignored (idempotente)", parsed.resourceId);
    }
    await finalizeMercadoPagoWebhookLog(logId, {
      status: message.includes("duplicate key") ? "skipped" : "failed",
      outcome: { ok: true, skipped: "duplicate_or_error", error: "logged" },
      error: message,
    }).catch((auditErr) => {
      console.error("[mp-webhook] audit finalize failed", auditErr);
    });
    res.status(200).json({ ok: true, error: "logged" });
  }
}
