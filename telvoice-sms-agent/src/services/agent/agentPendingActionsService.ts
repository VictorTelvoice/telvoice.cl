import { randomUUID } from "node:crypto";
import { getSupabase } from "../../database/supabaseClient.js";
import { isMissingTableError } from "../../utils/db-table.js";
import { wrapSupabaseError } from "../../utils/supabase-errors.js";
import type {
  AgentExecutionContext,
  PendingActionPayload,
  PendingActionType,
} from "./types.js";
import type { StoredPendingAction } from "./pendingActions.js";

const TTL_MS = 15 * 60 * 1000;
const memoryFallback = new Map<string, StoredPendingAction>();

function rowToStored(
  row: {
    id: string;
    action_type: string;
    summary: string;
    payload: PendingActionPayload;
    channel: string;
    session_id: string;
    user_id: string | null;
    company_id: string | null;
    expires_at: string;
    created_at: string;
  },
): StoredPendingAction {
  return {
    id: row.id,
    type: row.action_type as PendingActionType,
    summary: row.summary,
    payload: row.payload ?? {},
    context: {
      channel: row.channel as AgentExecutionContext["channel"],
      companyId: row.company_id ?? "",
      userId: row.user_id,
      sessionId: row.session_id,
    },
    createdAt: new Date(row.created_at).getTime(),
    expiresAt: new Date(row.expires_at).getTime(),
  };
}

export async function createPendingActionDb(input: {
  type: PendingActionType;
  summary: string;
  payload: PendingActionPayload;
  context: AgentExecutionContext;
}): Promise<StoredPendingAction> {
  const id = randomUUID();
  const createdAt = Date.now();
  const expiresAt = new Date(createdAt + TTL_MS).toISOString();

  const insertRow = {
    id,
    channel: input.context.channel,
    session_id: input.context.sessionId,
    user_id: input.context.userId,
    company_id: input.context.companyId || null,
    action_type: input.type,
    payload: input.payload,
    summary: input.summary,
    status: "pending",
    expires_at: expiresAt,
  };

  const { error } = await getSupabase()
    .from("agent_pending_actions")
    .insert(insertRow);

  const stored: StoredPendingAction = {
    id,
    type: input.type,
    summary: input.summary,
    payload: input.payload,
    context: input.context,
    createdAt,
    expiresAt: createdAt + TTL_MS,
  };

  if (error) {
    if (isMissingTableError(error)) {
      memoryFallback.set(id, stored);
      return stored;
    }
    wrapSupabaseError(error, "createPendingActionDb");
  }

  return stored;
}

export async function getPendingActionDb(
  id: string,
): Promise<StoredPendingAction | null> {
  const mem = memoryFallback.get(id);
  if (mem) {
    if (mem.expiresAt <= Date.now()) {
      memoryFallback.delete(id);
      return null;
    }
    return mem;
  }

  const { data, error } = await getSupabase()
    .from("agent_pending_actions")
    .select("*")
    .eq("id", id)
    .eq("status", "pending")
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getPendingActionDb");
  }

  if (!data) {
    return null;
  }

  const row = data as { expires_at: string };
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await expirePendingActionDb(id);
    return null;
  }

  return rowToStored(data as Parameters<typeof rowToStored>[0]);
}

export async function findPendingForSessionDb(
  sessionId: string,
  companyId: string,
): Promise<StoredPendingAction | null> {
  for (const row of memoryFallback.values()) {
    if (
      row.context.sessionId === sessionId &&
      row.context.companyId === companyId &&
      row.expiresAt > Date.now()
    ) {
      return row;
    }
  }

  const { data, error } = await getSupabase()
    .from("agent_pending_actions")
    .select("*")
    .eq("session_id", sessionId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "findPendingForSessionDb");
  }

  for (const row of data ?? []) {
    const stored = rowToStored(row as Parameters<typeof rowToStored>[0]);
    if (stored.context.companyId === companyId) {
      return stored;
    }
  }

  return null;
}

async function expirePendingActionDb(id: string): Promise<void> {
  memoryFallback.delete(id);
  await getSupabase()
    .from("agent_pending_actions")
    .update({ status: "expired" })
    .eq("id", id);
}

export async function clearPendingActionDb(
  id: string,
  status: "confirmed" | "cancelled",
): Promise<void> {
  memoryFallback.delete(id);
  const patch =
    status === "confirmed"
      ? { status: "confirmed", confirmed_at: new Date().toISOString() }
      : { status: "cancelled", cancelled_at: new Date().toISOString() };

  const { error } = await getSupabase()
    .from("agent_pending_actions")
    .update(patch)
    .eq("id", id);

  if (error && !isMissingTableError(error)) {
    wrapSupabaseError(error, "clearPendingActionDb");
  }
}
