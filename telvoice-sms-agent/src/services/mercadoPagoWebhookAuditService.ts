import { getSupabase } from "../database/supabaseClient.js";
import { isMissingTableError } from "../utils/db-table.js";
import type { ParsedMercadoPagoWebhookRequest } from "../utils/mercadoPagoWebhookRequest.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export type MercadoPagoWebhookLogStatus = "received" | "processed" | "failed" | "skipped";

export type RecordMercadoPagoWebhookInput = ParsedMercadoPagoWebhookRequest & {
  externalReference?: string | null;
  orderId?: string | null;
  payerEmail?: string | null;
};

function outcomeOrderId(outcome: Record<string, unknown> | null | undefined): string | null {
  if (!outcome) return null;
  const direct = outcome.orderId ?? outcome.order_id;
  return direct != null ? String(direct) : null;
}

function outcomeResult(outcome: Record<string, unknown> | null | undefined): string | null {
  if (!outcome) return null;
  const result = outcome.result ?? outcome.skipped;
  return result != null ? String(result) : null;
}

export async function recordMercadoPagoWebhookReceived(
  input: RecordMercadoPagoWebhookInput,
): Promise<string | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("mercadopago_webhook_logs")
    .insert({
      topic: input.topic,
      resource_id: input.resourceId,
      delivery_source: input.deliverySource,
      external_reference: input.externalReference ?? null,
      order_id: input.orderId ?? null,
      payer_email: input.payerEmail ?? null,
      http_method: input.httpMethod,
      request_query: input.query,
      request_body: input.body,
      processing_status: "received",
    })
    .select("id")
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      console.warn("[mp-webhook-audit] mercadopago_webhook_logs missing — skip persist");
      return null;
    }
    throw wrapSupabaseError(error, "recordMercadoPagoWebhookReceived");
  }

  return data?.id != null ? String(data.id) : null;
}

export async function finalizeMercadoPagoWebhookLog(
  logId: string | null,
  input: {
    status: MercadoPagoWebhookLogStatus;
    outcome?: Record<string, unknown> | null;
    externalReference?: string | null;
    orderId?: string | null;
    payerEmail?: string | null;
    error?: string | null;
  },
): Promise<void> {
  if (!logId) return;

  const sb = getSupabase();
  const resolvedOrderId = input.orderId ?? outcomeOrderId(input.outcome ?? undefined);
  const { error } = await sb
    .from("mercadopago_webhook_logs")
    .update({
      processing_status: input.status,
      processing_result: outcomeResult(input.outcome ?? undefined),
      processing_error: input.error ?? null,
      processing_outcome: input.outcome ?? null,
      external_reference: input.externalReference ?? undefined,
      order_id: resolvedOrderId ?? undefined,
      payer_email: input.payerEmail ?? undefined,
      processed_at: new Date().toISOString(),
    })
    .eq("id", logId);

  if (error && !isMissingTableError(error)) {
    throw wrapSupabaseError(error, "finalizeMercadoPagoWebhookLog");
  }
}
