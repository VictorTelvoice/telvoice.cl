import { getSupabase } from "../../database/supabaseClient.js";
import { isMissingTableError } from "../../utils/db-table.js";
import type { AgentSalesEventType } from "../../types/agent-sales.js";

export type RecordAgentSalesEventInput = {
  eventType: AgentSalesEventType;
  channel: string;
  source?: string;
  sessionId?: string | null;
  companyId?: string | null;
  userId?: string | null;
  quantitySms?: number | null;
  unitPriceNet?: number | null;
  subtotalNet?: number | null;
  iva?: number | null;
  totalClp?: number | null;
  orderId?: string | null;
  paymentStatus?: string | null;
  metadata?: Record<string, unknown>;
};

/** Persistencia ligera; nunca interrumpe el flujo del agente. */
export async function recordAgentSalesEvent(
  input: RecordAgentSalesEventInput,
): Promise<void> {
  try {
    const { error } = await getSupabase().from("agent_sales_events").insert({
      channel: input.channel,
      source: input.source ?? "agent_panel",
      session_id: input.sessionId ?? null,
      company_id: input.companyId ?? null,
      user_id: input.userId ?? null,
      event_type: input.eventType,
      quantity_sms: input.quantitySms ?? null,
      unit_price_net: input.unitPriceNet ?? null,
      subtotal_net: input.subtotalNet ?? null,
      iva: input.iva ?? null,
      total_clp: input.totalClp ?? null,
      order_id: input.orderId ?? null,
      payment_status: input.paymentStatus ?? null,
      metadata: input.metadata ?? {},
    });

    if (error && !isMissingTableError(error)) {
      console.warn(
        "[agentSalesEvents] record failed",
        input.eventType,
        error.message,
      );
    }
  } catch (err) {
    console.warn(
      "[agentSalesEvents] record exception",
      input.eventType,
      err instanceof Error ? err.message : err,
    );
  }
}
