import { getSupabase } from "../database/supabaseClient.js";
import type { InboundSmsMessageRow } from "../types/client-numbers.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export type AdminInboundSmsItem = InboundSmsMessageRow & {
  company_name: string;
  client_number_label: string;
};

export type AdminSmsInboxFilters = {
  company_id?: string;
  number_id?: string;
  q?: string;
  from?: string;
  start_date?: string;
  end_date?: string;
};

function mapRow(row: Record<string, unknown>): InboundSmsMessageRow {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    client_number_id: String(row.client_number_id),
    to_number: String(row.to_number),
    from_number: row.from_number != null ? String(row.from_number) : null,
    body: String(row.body),
    detected_otp: row.detected_otp != null ? String(row.detected_otp) : null,
    received_at: String(row.received_at),
    status: row.status as InboundSmsMessageRow["status"],
    source: row.source != null ? String(row.source) : null,
    raw_payload:
      row.raw_payload && typeof row.raw_payload === "object"
        ? (row.raw_payload as Record<string, unknown>)
        : null,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
    created_at: String(row.created_at),
  };
}

export async function listAdminInboundSms(
  filters: AdminSmsInboxFilters = {},
  limit = 300,
): Promise<AdminInboundSmsItem[]> {
  const sb = getSupabase();
  let query = sb
    .from("inbound_sms_messages")
    .select("*, companies(name), client_numbers(number)")
    .order("received_at", { ascending: false })
    .limit(limit);

  if (filters.company_id) query = query.eq("company_id", filters.company_id);
  if (filters.number_id) query = query.eq("client_number_id", filters.number_id);
  if (filters.from) query = query.ilike("from_number", `%${filters.from}%`);
  if (filters.start_date) {
    query = query.gte("received_at", `${filters.start_date}T00:00:00.000Z`);
  }
  if (filters.end_date) {
    query = query.lte("received_at", `${filters.end_date}T23:59:59.999Z`);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) return [];
    throw wrapSupabaseError(error, "inbound_sms_messages");
  }

  let rows = (data ?? []).map((row) => {
    const mapped = mapRow(row as Record<string, unknown>);
    const r = row as {
      companies?: { name?: string };
      client_numbers?: { number?: string };
    };
    return {
      ...mapped,
      company_name: r.companies?.name ?? "—",
      client_number_label: r.client_numbers?.number ?? mapped.to_number,
    };
  });

  if (filters.q) {
    const q = filters.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.body.toLowerCase().includes(q) ||
        (r.from_number?.toLowerCase().includes(q) ?? false) ||
        (r.detected_otp?.includes(q) ?? false) ||
        r.company_name.toLowerCase().includes(q),
    );
  }

  return rows;
}
