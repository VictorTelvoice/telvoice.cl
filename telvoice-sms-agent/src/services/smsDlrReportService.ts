import { getSupabase } from "../database/supabaseClient.js";
import type { PanelSmsMessageRow } from "../types/sms-panel.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export type DlrReportFilters = {
  startDate?: string;
  endDate?: string;
  senderId?: string;
  phoneNumber?: string;
  jobId?: string;
  dlrStatuses?: string[];
  country?: string;
  mcc?: string;
  mnc?: string;
  page?: number;
  pageSize?: number;
};

export type DlrReportRow = {
  jobId: string;
  smsId: string;
  customerName: string;
  senderId: string;
  dlrStatus: string;
  phoneNumber: string;
  mcc: string;
  mnc: string;
  countryRealName: string;
  operatorName: string;
  smsSource: string;
  messageType: string;
  messageLength: number;
  messageParts: number;
  clientRate: string;
  clientCost: string;
  submitDateUtc: string;
  sentAtIso: string;
  sentDateUtc: string;
  dlrAtIso: string;
  dlrDateUtc: string;
  errorCode: string;
  errorDescription: string;
  charactersAdded: string;
  smsMessage: string;
  smsType: string;
  panelMessageId: string;
};

export type DlrReportResult = {
  rows: DlrReportRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    total: number;
    delivered: number;
    sent: number;
    failed: number;
    pending: number;
    smsConsumed: number;
  };
  filterOptions: {
    senderIds: string[];
    countries: string[];
    mccs: string[];
    mncs: string[];
  };
};

const CSV_HEADERS = [
  "JobID",
  "SMSID",
  "CustomerName",
  "SenderID",
  "DLRStatus",
  "PhoneNumber",
  "MCC",
  "MNC",
  "CountryRealName",
  "OperatorName",
  "SMSSource",
  "MessageType",
  "MessageLength",
  "MessageParts",
  "ClientRate",
  "ClientCost",
  "SubmitDateUTC",
  "SentDateUTC",
  "DLRDateUTC",
  "ErrorCode",
  "ErrorDescription",
  "CharactersAdded",
  "SMSMessage",
  "SMSType",
] as const;

function pickStr(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = record[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return "";
}

function pickNum(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const v = record[key];
    if (typeof v === "number" && !Number.isNaN(v)) {
      return v;
    }
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
      return Number(v);
    }
  }
  return null;
}

function formatCsvDate(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return d.toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

/** Fecha/hora completa para tablas del reporte DLR (día, mes, año, hora, minuto, segundo). */
function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "—";
  }
  return d.toLocaleString("es-CL", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

function mapSourceLabel(source: string | null, mode: string): string {
  if (mode === "mock") {
    return "Mock";
  }
  if (!source) {
    return "API";
  }
  if (source.includes("scheduled")) {
    return "Scheduled";
  }
  if (source.includes("mass")) {
    return "Campaign";
  }
  return "API";
}

function resolveDlrStatus(
  msg: PanelSmsMessageRow,
  dlrPayload: Record<string, unknown>,
): string {
  const fromDlr = pickStr(dlrPayload, "DLRStatus", "dlr_status", "Status");
  if (fromDlr) {
    return fromDlr;
  }
  const meta = msg.metadata ?? {};
  const last = typeof meta.last_dlr_status === "string" ? meta.last_dlr_status : "";
  if (last) {
    return last;
  }
  const map: Record<string, string> = {
    delivered: "Delivered",
    sent: "Sent",
    failed: "Failed",
    pending: "Pending",
    queued: "Queued",
    rejected: "Rejected",
    expired: "Expired",
  };
  return map[msg.status] ?? msg.status;
}

function buildRow(
  msg: PanelSmsMessageRow,
  companyName: string,
  dlrPayload: Record<string, unknown>,
): DlrReportRow {
  const meta = (msg.metadata ?? {}) as Record<string, unknown>;
  const smsId =
    pickStr(dlrPayload, "SMSID", "sms_id") ||
    msg.provider_message_id ||
    msg.id;
  const clientCostNum =
    pickNum(dlrPayload, "ClientCost", "client_cost") ?? msg.cost_sms * 10;
  const clientRate =
    pickStr(dlrPayload, "ClientRate") ||
    (clientCostNum / Math.max(1, msg.segments)).toFixed(5);
  const messageLength =
    pickNum(dlrPayload, "MessageLength", "message_length") ?? msg.message.length;
  const messageParts =
    pickNum(dlrPayload, "MessageParts", "message_parts") ?? msg.segments;

  const dlrStatus = resolveDlrStatus(msg, dlrPayload);
  const sentIso = msg.sent_at ?? (pickStr(dlrPayload, "SentDateUTC") || null);
  const dlrIso =
    msg.delivered_at ??
    (typeof meta.last_dlr_at === "string" ? meta.last_dlr_at : null) ??
    (pickStr(dlrPayload, "DLRDateUTC") || null);

  return {
    jobId:
      msg.campaign_id?.slice(0, 8) ??
      (pickStr(meta, "job_id", "JobID") || "0"),
    smsId,
    customerName: companyName,
    senderId:
      msg.sender_id ?? (pickStr(dlrPayload, "SenderId", "sender_id") || "—"),
    dlrStatus,
    phoneNumber: phoneDigits(msg.recipient_number),
    mcc: pickStr(dlrPayload, "MCC", "mcc") || "730",
    mnc: pickStr(dlrPayload, "MNC", "mnc") || msg.operator || "—",
    countryRealName: pickStr(dlrPayload, "CountryRealName") || "Chile",
    operatorName:
      pickStr(dlrPayload, "OperatorName") || msg.operator || "—",
    smsSource: mapSourceLabel(
      typeof meta.source === "string" ? meta.source : null,
      msg.mode,
    ),
    messageType: pickStr(dlrPayload, "MessageType") || "Default",
    messageLength,
    messageParts,
    clientRate,
    clientCost: clientCostNum.toFixed(5),
    submitDateUtc: formatCsvDate(msg.created_at),
    sentAtIso: sentIso ?? "",
    sentDateUtc: formatCsvDate(sentIso),
    dlrAtIso: dlrIso ?? "",
    dlrDateUtc: formatCsvDate(dlrIso),
    errorCode:
      pickStr(dlrPayload, "ErrorCode", "error_code") ||
      msg.error_code ||
      "0",
    errorDescription:
      pickStr(dlrPayload, "ErrorDescription", "error_description") ||
      msg.error_message ||
      pickStr(meta, "remarks") ||
      "",
    charactersAdded: pickStr(dlrPayload, "CharactersAdded") || "",
    smsMessage:
      pickStr(dlrPayload, "SMSMessage", "sms_message") || msg.message,
    smsType: pickStr(dlrPayload, "SMSType", "sms_type") || "Promotional",
    panelMessageId: msg.id,
  };
}

function rowMatchesFilters(row: DlrReportRow, filters: DlrReportFilters): boolean {
  if (filters.dlrStatuses?.length) {
    const want = filters.dlrStatuses.map((s) => s.toLowerCase());
    if (!want.includes(row.dlrStatus.toLowerCase())) {
      return false;
    }
  }
  if (filters.country?.trim() && filters.country !== "all") {
    if (
      row.countryRealName.toLowerCase() !== filters.country.trim().toLowerCase()
    ) {
      return false;
    }
  }
  if (filters.mcc?.trim() && row.mcc !== filters.mcc.trim()) {
    return false;
  }
  if (filters.mnc?.trim() && row.mnc !== filters.mnc.trim()) {
    return false;
  }
  return true;
}

async function loadDlrPayloadsByProviderIds(
  ids: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  if (!ids.length) {
    return map;
  }
  const unique = [...new Set(ids.filter(Boolean))];
  const { data, error } = await getSupabase()
    .from("sms_dlr_events")
    .select("provider_message_id, raw_payload, received_at")
    .in("provider_message_id", unique)
    .order("received_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error)) {
      return map;
    }
    wrapSupabaseError(error, "loadDlrPayloadsByProviderIds");
  }

  for (const row of data ?? []) {
    const id = String(row.provider_message_id ?? "");
    if (!id || map.has(id)) {
      continue;
    }
    map.set(id, (row.raw_payload ?? {}) as Record<string, unknown>);
  }
  return map;
}

export function parseDlrReportFilters(
  query: Record<string, string | string[] | undefined>,
): DlrReportFilters {
  const str = (k: string) => {
    const v = query[k];
    return typeof v === "string" ? v.trim() : "";
  };
  const statusVal = query.status ?? query.dlr_status;
  let dlrStatuses: string[] = [];
  if (Array.isArray(statusVal)) {
    dlrStatuses = statusVal.map((s) => String(s).trim()).filter(Boolean);
  } else if (typeof statusVal === "string" && statusVal.trim()) {
    dlrStatuses = statusVal.split(",").map((s) => s.trim()).filter(Boolean);
  }

  return {
    startDate: str("start_date") || str("from") || undefined,
    endDate: str("end_date") || str("to") || undefined,
    senderId: str("sender_id") || undefined,
    phoneNumber: str("phone") || str("phone_number") || undefined,
    jobId: str("job_id") || undefined,
    dlrStatuses: dlrStatuses.length ? dlrStatuses : undefined,
    country: str("country") || undefined,
    mcc: str("mcc") || undefined,
    mnc: str("mnc") || undefined,
    page: Math.max(1, Number.parseInt(str("page") || "1", 10) || 1),
    pageSize: Math.min(
      100,
      Math.max(10, Number.parseInt(str("page_size") || "25", 10) || 25),
    ),
  };
}

export async function queryDlrReport(
  companyId: string,
  companyName: string,
  filters: DlrReportFilters,
): Promise<DlrReportResult> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;

  let q = getSupabase()
    .from("panel_sms_messages")
    .select("*", { count: "exact" })
    .eq("company_id", companyId)
    .neq("mode", "mock")
    .order("created_at", { ascending: false })
    .limit(2000);

  if (filters.startDate) {
    q = q.gte("created_at", `${filters.startDate}T00:00:00.000Z`);
  }
  if (filters.endDate) {
    q = q.lte("created_at", `${filters.endDate}T23:59:59.999Z`);
  }
  if (filters.senderId) {
    q = q.ilike("sender_id", `%${filters.senderId}%`);
  }
  if (filters.phoneNumber) {
    const digits = phoneDigits(filters.phoneNumber);
    if (digits) {
      q = q.ilike("recipient_number", `%${digits.slice(-9)}%`);
    }
  }
  if (filters.jobId) {
    const jid = filters.jobId.trim();
    if (jid.length >= 8 && jid.includes("-")) {
      q = q.eq("campaign_id", jid);
    } else {
      q = q.ilike("campaign_id", `%${jid}%`);
    }
  }

  const { data, error } = await q;
  if (error) {
    if (isMissingTableError(error)) {
      return {
        rows: [],
        total: 0,
        page,
        pageSize,
        summary: {
          total: 0,
          delivered: 0,
          sent: 0,
          failed: 0,
          pending: 0,
          smsConsumed: 0,
        },
        filterOptions: { senderIds: [], countries: [], mccs: [], mncs: [] },
      };
    }
    wrapSupabaseError(error, "queryDlrReport");
  }

  const messages = (data ?? []) as PanelSmsMessageRow[];
  const providerIds = messages
    .map((m) => m.provider_message_id)
    .filter((id): id is string => Boolean(id));
  const dlrMap = await loadDlrPayloadsByProviderIds(providerIds);

  let allRows = messages.map((msg) => {
    const meta = (msg.metadata ?? {}) as Record<string, unknown>;
    const fromMeta =
      meta.last_dlr_payload && typeof meta.last_dlr_payload === "object"
        ? (meta.last_dlr_payload as Record<string, unknown>)
        : {};
    const fromTable = msg.provider_message_id
      ? dlrMap.get(msg.provider_message_id) ?? {}
      : {};
    return buildRow(msg, companyName, { ...fromTable, ...fromMeta });
  });

  allRows = allRows.filter((r) => rowMatchesFilters(r, filters));

  const senderIds = [...new Set(allRows.map((r) => r.senderId).filter((s) => s !== "—"))].sort();
  const countries = [...new Set(allRows.map((r) => r.countryRealName))].sort();
  const mccs = [...new Set(allRows.map((r) => r.mcc).filter(Boolean))].sort();
  const mncs = [...new Set(allRows.map((r) => r.mnc).filter((s) => s !== "—"))].sort();

  const summary = {
    total: allRows.length,
    delivered: allRows.filter((r) => r.dlrStatus.toLowerCase() === "delivered")
      .length,
    sent: allRows.filter((r) => r.dlrStatus.toLowerCase() === "sent").length,
    failed: allRows.filter((r) =>
      ["failed", "rejected", "expired"].includes(r.dlrStatus.toLowerCase()),
    ).length,
    pending: allRows.filter((r) =>
      ["pending", "queued"].includes(r.dlrStatus.toLowerCase()),
    ).length,
    smsConsumed: messages.reduce((s, m) => s + (m.cost_sms ?? 0), 0),
  };

  const total = allRows.length;
  const offset = (page - 1) * pageSize;
  const rows = allRows.slice(offset, offset + pageSize);

  return {
    rows,
    total,
    page,
    pageSize,
    summary,
    filterOptions: { senderIds, countries, mccs, mncs },
  };
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function dlrReportRowsToCsv(rows: DlrReportRow[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.jobId,
        r.smsId,
        r.customerName,
        r.senderId,
        r.dlrStatus,
        r.phoneNumber,
        r.mcc,
        r.mnc,
        r.countryRealName,
        r.operatorName,
        r.smsSource,
        r.messageType,
        String(r.messageLength),
        String(r.messageParts),
        r.clientRate,
        r.clientCost,
        r.submitDateUtc,
        r.sentDateUtc,
        r.dlrDateUtc,
        r.errorCode,
        r.errorDescription,
        r.charactersAdded,
        r.smsMessage,
        r.smsType,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return lines.join("\n");
}

export { formatDisplayDate };
