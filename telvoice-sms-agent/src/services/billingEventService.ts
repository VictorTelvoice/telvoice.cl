import { getSupabase } from "../database/supabaseClient.js";
import type { BillingEvent, BillingEventType } from "../types/billing.js";

export async function recordBillingEvent(input: {
  invoiceId: string;
  companyId: string | null;
  eventType: BillingEventType | string;
  description?: string | null;
  actorType?: string | null;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<BillingEvent | null> {
  try {
    const { data, error } = await getSupabase()
      .from("billing_events")
      .insert({
        invoice_id: input.invoiceId,
        company_id: input.companyId,
        event_type: input.eventType,
        description: input.description ?? null,
        actor_type: input.actorType ?? null,
        actor_id: input.actorId ?? null,
        metadata: input.metadata ?? {},
      })
      .select("*")
      .single();

    if (error) {
      console.warn("[billing] recordBillingEvent failed", error);
      return null;
    }
    return data as BillingEvent;
  } catch (err) {
    console.warn("[billing] recordBillingEvent exception", err);
    return null;
  }
}

