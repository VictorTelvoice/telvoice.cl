import { getSupabase } from "../database/supabaseClient.js";
import type { AuditLogRow } from "../types/tenant.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export type AuditAction =
  | "client.create"
  | "client.suspend"
  | "client.update_profile"
  | "client.suspend_sending"
  | "client.reactivate_sending"
  | "client.resend_welcome"
  | "client.resend_receipt"
  | "client.archive_qa"
  | "wallet.credit"
  | "wallet.debit"
  | "api_key.create"
  | "api_key.revoke"
  | "order.confirm"
  | "pricing.update"
  | "route.update"
  | "provider.update";

export async function insertAuditLog(input: {
  actorUserId?: string | null;
  actorRole?: string | null;
  companyId?: string | null;
  action: AuditAction | string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}): Promise<AuditLogRow | null> {
  try {
    const { data, error } = await getSupabase()
      .from("audit_logs")
      .insert({
        actor_user_id: input.actorUserId ?? null,
        actor_role: input.actorRole ?? null,
        company_id: input.companyId ?? null,
        action: input.action,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        metadata: input.metadata ?? {},
        ip_address: input.ipAddress ?? null,
      })
      .select("*")
      .single();

    if (error) {
      const message = String(error.message ?? "");
      if (
        error.code === "42P01" ||
        error.code === "PGRST205" ||
        message.includes("audit_logs")
      ) {
        return null;
      }
      wrapSupabaseError(error, "insertAuditLog");
    }

    return data as AuditLogRow;
  } catch {
    return null;
  }
}
