import { getSupabase } from "../database/supabaseClient.js";
import type { AsmscDlrWebhookBody } from "../types/asmsc.js";
import type {
  CreatePendingSmsInput,
  SmsDlrEventRow,
  SmsMessageRow,
  UpdateSmsAfterSubmitInput,
  UpdateSmsFromDlrInput,
} from "../types/database.js";
import { NotFoundError } from "../utils/errors.js";
import { pickInteger, pickString } from "../utils/asmsc-response.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

const LIST_LIMIT = 50;

export async function createPendingMessage(
  input: CreatePendingSmsInput,
): Promise<SmsMessageRow> {
  const { data, error } = await getSupabase()
    .from("sms_messages")
    .insert({
      client_id: input.client_id,
      provider: input.provider ?? "asmsc",
      uid: input.uid,
      phonenumber: input.phonenumber,
      sender_id: input.sender_id,
      textmessage: input.textmessage,
      sms_type: input.sms_type,
      encoding: input.encoding,
      estimated_parts: input.estimated_parts,
      status: "pending_submit",
    })
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "createPendingMessage");
  }

  return data as SmsMessageRow;
}

export async function updateMessageAfterSubmit(
  id: string,
  input: UpdateSmsAfterSubmitInput,
): Promise<SmsMessageRow> {
  const { data, error } = await getSupabase()
    .from("sms_messages")
    .update({
      provider_message_id: input.provider_message_id ?? null,
      provider_status: input.provider_status ?? null,
      remarks: input.remarks ?? null,
      raw_submit_response: input.raw_submit_response ?? null,
      status: input.status,
      sent_at: input.sent_at ?? null,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "updateMessageAfterSubmit");
  }

  return data as SmsMessageRow;
}

export async function getMessageById(id: string): Promise<SmsMessageRow> {
  const { data, error } = await getSupabase()
    .from("sms_messages")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    wrapSupabaseError(error, "getMessageById");
  }

  if (!data) {
    throw new NotFoundError(`Mensaje SMS no encontrado: ${id}`);
  }

  return data as SmsMessageRow;
}

export async function getMessageByUid(uid: string): Promise<SmsMessageRow> {
  const { data, error } = await getSupabase()
    .from("sms_messages")
    .select("*")
    .eq("uid", uid)
    .maybeSingle();

  if (error) {
    wrapSupabaseError(error, "getMessageByUid");
  }

  if (!data) {
    throw new NotFoundError(`Mensaje SMS no encontrado para uid: ${uid}`);
  }

  return data as SmsMessageRow;
}

export interface SmsMessageStats {
  total: number;
  submitted: number;
  failed: number;
  delivered: number;
}

async function countMessages(filter?: {
  status?: string;
}): Promise<number> {
  let query = getSupabase()
    .from("sms_messages")
    .select("id", { count: "exact", head: true });

  if (filter?.status) {
    query = query.eq("status", filter.status);
  }

  const { count, error } = await query;

  if (error) {
    wrapSupabaseError(error, "countMessages");
  }

  return count ?? 0;
}

export async function getSmsMessageStats(): Promise<SmsMessageStats> {
  const [total, submitted, failed, delivered] = await Promise.all([
    countMessages(),
    countMessages({ status: "submitted" }),
    countMessages({ status: "failed" }),
    countMessages({ status: "delivered" }),
  ]);

  return { total, submitted, failed, delivered };
}

export async function listRecentMessages(
  limit: number = LIST_LIMIT,
): Promise<SmsMessageRow[]> {
  const { data, error } = await getSupabase()
    .from("sms_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    wrapSupabaseError(error, "listRecentMessages");
  }

  return (data ?? []) as SmsMessageRow[];
}

export async function listRecentMessagesByClientId(
  clientId: string,
  limit = 5,
): Promise<SmsMessageRow[]> {
  const { data, error } = await getSupabase()
    .from("sms_messages")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    wrapSupabaseError(error, "listRecentMessagesByClientId");
  }

  return (data ?? []) as SmsMessageRow[];
}

export async function findMessageByUid(
  uid: string,
): Promise<SmsMessageRow | null> {
  const { data, error } = await getSupabase()
    .from("sms_messages")
    .select("*")
    .eq("uid", uid)
    .maybeSingle();

  if (error) {
    wrapSupabaseError(error, "findMessageByUid");
  }

  return data as SmsMessageRow | null;
}

export async function findMessageByProviderMessageId(
  providerMessageId: string,
): Promise<SmsMessageRow | null> {
  const { data, error } = await getSupabase()
    .from("sms_messages")
    .select("*")
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();

  if (error) {
    wrapSupabaseError(error, "findMessageByProviderMessageId");
  }

  return data as SmsMessageRow | null;
}

export async function updateMessageFromDlr(
  id: string,
  input: UpdateSmsFromDlrInput,
): Promise<SmsMessageRow> {
  const { data, error } = await getSupabase()
    .from("sms_messages")
    .update({
      dlr_status: input.dlr_status ?? null,
      sms_id: input.sms_id ?? null,
      client_cost: input.client_cost ?? null,
      error_code: input.error_code ?? null,
      error_description: input.error_description ?? null,
      remarks: input.remarks ?? null,
      raw_dlr_payload: input.raw_dlr_payload ?? null,
      status: input.status,
      delivered_at: input.delivered_at ?? null,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "updateMessageFromDlr");
  }

  return data as SmsMessageRow;
}

export interface CreateDlrEventInput {
  raw_payload: Record<string, unknown>;
  sms_message_id?: string | null;
  uid?: string | null;
  provider_message_id?: string | null;
  phone_number?: string | null;
  dlr_status?: string | null;
  sms_id?: string | null;
  client_cost?: number | null;
  error_code?: string | null;
  error_description?: string | null;
}

export async function createDlrEvent(
  input: CreateDlrEventInput,
): Promise<SmsDlrEventRow> {
  const { data, error } = await getSupabase()
    .from("sms_dlr_events")
    .insert({
      sms_message_id: input.sms_message_id ?? null,
      uid: input.uid ?? null,
      provider_message_id: input.provider_message_id ?? null,
      phone_number: input.phone_number ?? null,
      dlr_status: input.dlr_status ?? null,
      sms_id: input.sms_id ?? null,
      client_cost: input.client_cost ?? null,
      error_code: input.error_code ?? null,
      error_description: input.error_description ?? null,
      raw_payload: input.raw_payload,
    })
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "createDlrEvent");
  }

  return data as SmsDlrEventRow;
}

export function extractDlrFields(body: AsmscDlrWebhookBody): {
  uid: string | null;
  provider_message_id: string | null;
  phone_number: string | null;
  dlr_status: string | null;
  sms_id: string | null;
  client_cost: number | null;
  error_code: string | null;
  error_description: string | null;
  remarks: string | null;
} {
  const record = body as Record<string, unknown>;

  return {
    uid: pickString(record, "uid", "UID"),
    provider_message_id: pickString(
      record,
      "message_id",
      "MessageID",
      "MessageId",
    ),
    phone_number: pickString(record, "PhoneNumber", "phonenumber", "phone"),
    dlr_status: pickString(record, "DLRStatus", "dlr_status", "Status"),
    sms_id: pickString(record, "SMSID", "sms_id", "SmsId"),
    client_cost: pickInteger(record, "ClientCost", "client_cost", "cost"),
    error_code: pickString(record, "ErrorCode", "error_code"),
    error_description: pickString(
      record,
      "ErrorDescription",
      "error_description",
      "ErrorDesc",
    ),
    remarks: pickString(record, "Remarks", "remarks", "remark"),
  };
}

export async function listDlrEventsByMessageId(
  smsMessageId: string,
): Promise<SmsDlrEventRow[]> {
  const { data, error } = await getSupabase()
    .from("sms_dlr_events")
    .select("*")
    .eq("sms_message_id", smsMessageId)
    .order("received_at", { ascending: false });

  if (error) {
    wrapSupabaseError(error, "listDlrEventsByMessageId");
  }

  return (data ?? []) as SmsDlrEventRow[];
}

export async function linkDlrEventToMessage(
  dlrEventId: string,
  smsMessageId: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from("sms_dlr_events")
    .update({ sms_message_id: smsMessageId })
    .eq("id", dlrEventId);

  if (error) {
    wrapSupabaseError(error, "linkDlrEventToMessage");
  }
}

export function toPublicMessage(row: SmsMessageRow) {
  return {
    internal_message_id: row.id,
    uid: row.uid,
    client_id: row.client_id,
    provider: row.provider,
    phonenumber: row.phonenumber,
    sender_id: row.sender_id,
    textmessage: row.textmessage,
    sms_type: row.sms_type,
    encoding: row.encoding,
    estimated_parts: row.estimated_parts,
    status: row.status,
    provider_message_id: row.provider_message_id,
    provider_status: row.provider_status,
    remarks: row.remarks,
    dlr_status: row.dlr_status,
    sms_id: row.sms_id,
    client_cost: row.client_cost,
    error_code: row.error_code,
    error_description: row.error_description,
    raw_submit_response: row.raw_submit_response,
    raw_dlr_payload: row.raw_dlr_payload,
    sent_at: row.sent_at,
    delivered_at: row.delivered_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
