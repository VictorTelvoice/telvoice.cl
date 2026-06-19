import { getSupabase } from "../database/supabaseClient.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export type SimScheduledPriceChangeStatus =
  | "pending"
  | "applied"
  | "failed"
  | "cancelled";

export type SimScheduledPriceChangeRow = {
  id: string;
  order_id: string;
  company_id: string | null;
  preapproval_id: string | null;
  plan_id: string;
  current_amount_clp: number;
  next_amount_clp: number;
  change_after_months: number;
  scheduled_at: string;
  status: SimScheduledPriceChangeStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  applied_at: string | null;
};

function addMonthsUtc(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export async function scheduleSimSubscriptionPriceChange(input: {
  orderId: string;
  companyId?: string | null;
  preapprovalId?: string | null;
  planId: string;
  currentAmountClp: number;
  nextAmountClp: number;
  changeAfterMonths: number;
  metadata?: Record<string, unknown>;
}): Promise<SimScheduledPriceChangeRow | null> {
  if (input.changeAfterMonths <= 0 || input.currentAmountClp <= 0) {
    return null;
  }
  if (input.nextAmountClp <= 0 || input.nextAmountClp === input.currentAmountClp) {
    return null;
  }

  const scheduledAt = addMonthsUtc(new Date(), input.changeAfterMonths);

  const { data, error } = await getSupabase()
    .from("sim_subscription_scheduled_price_changes")
    .insert({
      order_id: input.orderId,
      company_id: input.companyId?.trim() || null,
      preapproval_id: input.preapprovalId?.trim() || null,
      plan_id: input.planId,
      current_amount_clp: Math.round(input.currentAmountClp),
      next_amount_clp: Math.round(input.nextAmountClp),
      change_after_months: Math.round(input.changeAfterMonths),
      scheduled_at: scheduledAt.toISOString(),
      status: "pending",
      metadata: {
        reason: "intro_promo_end",
        ...(input.metadata ?? {}),
      },
    })
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "scheduleSimSubscriptionPriceChange");
  }

  return data as SimScheduledPriceChangeRow;
}
