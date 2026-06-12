import { createPgClient } from "../database/pgClient.js";
import { getSupabase } from "../database/supabaseClient.js";
import type {
  AdminActionLogRow,
  AdminClientActionType,
} from "../types/adminClientActions.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export type InsertAdminActionLogInput = {
  actorUserId?: string | null;
  actorEmail?: string | null;
  companyId: string;
  companySnapshot?: Record<string, unknown>;
  actionType: AdminClientActionType | string;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function insertAdminActionLog(
  input: InsertAdminActionLogInput,
): Promise<AdminActionLogRow | null> {
  const row = {
    actor_user_id: input.actorUserId ?? null,
    actor_email: input.actorEmail ?? null,
    company_id: input.companyId,
    company_snapshot: input.companySnapshot ?? {},
    action_type: input.actionType,
    previous_state: input.previousState ?? {},
    new_state: input.newState ?? {},
    metadata: input.metadata ?? {},
    ip_address: input.ipAddress ?? null,
    user_agent: input.userAgent ?? null,
  };

  const { data, error } = await getSupabase()
    .from("admin_action_logs")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return insertAdminActionLogPg(input);
    }
    wrapSupabaseError(error, "insertAdminActionLog");
  }

  return data as AdminActionLogRow;
}

async function insertAdminActionLogPg(
  input: InsertAdminActionLogInput,
): Promise<AdminActionLogRow | null> {
  const client = createPgClient();
  await client.connect();
  try {
    const res = await client.query(
      `
      INSERT INTO admin_action_logs (
        actor_user_id, actor_email, company_id, company_snapshot, action_type,
        previous_state, new_state, metadata, ip_address, user_agent
      ) VALUES ($1::uuid, $2, $3::uuid, $4::jsonb, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10)
      RETURNING *
      `,
      [
        input.actorUserId ?? null,
        input.actorEmail ?? null,
        input.companyId,
        JSON.stringify(input.companySnapshot ?? {}),
        input.actionType,
        JSON.stringify(input.previousState ?? {}),
        JSON.stringify(input.newState ?? {}),
        JSON.stringify(input.metadata ?? {}),
        input.ipAddress ?? null,
        input.userAgent ?? null,
      ],
    );
    return (res.rows[0] as AdminActionLogRow) ?? null;
  } catch {
    return null;
  } finally {
    await client.end();
  }
}

export async function listAdminActionLogsForCompany(
  companyId: string,
  limit = 15,
): Promise<AdminActionLogRow[]> {
  const { data, error } = await getSupabase()
    .from("admin_action_logs")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return listAdminActionLogsPg(companyId, limit);
    }
    wrapSupabaseError(error, "listAdminActionLogsForCompany");
  }

  return (data ?? []) as AdminActionLogRow[];
}

async function listAdminActionLogsPg(
  companyId: string,
  limit: number,
): Promise<AdminActionLogRow[]> {
  const client = createPgClient();
  await client.connect();
  try {
    const res = await client.query(
      `
      SELECT * FROM admin_action_logs
      WHERE company_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [companyId, limit],
    );
    return res.rows as AdminActionLogRow[];
  } catch {
    return [];
  } finally {
    await client.end();
  }
}
