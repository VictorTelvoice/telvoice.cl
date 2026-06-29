import {
  processMercadoPagoAuthorizedPaymentWebhook,
  processMercadoPagoPreapprovalWebhook,
  routeMercadoPagoWebhook,
} from "./mercadoPagoWebhookService.js";
import type { ParsedMercadoPagoWebhookRequest } from "../utils/mercadoPagoWebhookRequest.js";

export type MercadoPagoWebhookDispatchOutcome = Record<string, unknown> & {
  ok?: boolean;
  skipped?: string;
  orderId?: string;
  result?: string;
};

export async function dispatchMercadoPagoWebhook(
  parsed: ParsedMercadoPagoWebhookRequest,
): Promise<MercadoPagoWebhookDispatchOutcome> {
  if (parsed.topic === "subscription_authorized_payment" && parsed.resourceId) {
    const outcome = await processMercadoPagoAuthorizedPaymentWebhook(parsed.resourceId);
    return {
      ok: outcome.ok,
      orderId: outcome.orderId,
      result: outcome.result,
      paymentId: outcome.paymentId,
      subscriptionId: outcome.subscriptionId,
      risks: outcome.risks,
    };
  }

  if (parsed.topic === "subscription_preapproval" && parsed.resourceId) {
    const outcome = await processMercadoPagoPreapprovalWebhook(parsed.resourceId);
    return {
      ok: outcome.ok,
      orderId: outcome.orderId,
      subscriptionId: outcome.subscriptionId,
      result: outcome.result,
    };
  }

  if (parsed.topic === "payment" && parsed.resourceId) {
    const outcome = await routeMercadoPagoWebhook(parsed.resourceId);
    return {
      ok: outcome.ok,
      skipped: outcome.skipped,
      orderId: outcome.orderId,
      result: outcome.result,
    };
  }

  return { ok: true, skipped: "unsupported_or_missing_topic" };
}
