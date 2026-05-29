import { getSupabase } from "../database/supabaseClient.js";
import {
  getClientApiKeysModuleState,
  rowToClientApiKey,
} from "./clientApiKeyService.js";
import { getClientApiRequestsModuleState } from "./clientApiRequestLogService.js";
import { getSmsApiMessagesModuleState, rowToSmsApiMessage } from "./smsApiMessageService.js";
import type {
  AdminApiKeyListItem,
  AdminApiRequestDetail,
  AdminApiRequestListItem,
  AdminApiUsageFilters,
  AdminApiUsageModuleState,
  AdminApiUsageStats,
  AdminSmsApiMessageDetail,
  AdminSmsApiMessageListItem,
} from "../types/admin-api-usage.js";
import type { ClientApiKeyRow } from "../types/client-api-keys.js";
import type { ClientApiRequestMethod, ClientApiRequestRow } from "../types/client-api-requests.js";
import type { SmsApiMessageRow } from "../types/sms-api-messages.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

const REQUEST_SELECT =
  "id, company_id, api_key_id, request_id, endpoint, method, environment, status_code, success, error_code, error_message, duration_ms, metadata, created_at";

const KEY_SELECT =
  "id, company_id, name, key_prefix, key_masked, status, scopes, environment, last_used_at, created_at, updated_at";

function parseMethod(raw: string): ClientApiRequestMethod {
  if (
    raw === "GET" ||
    raw === "POST" ||
    raw === "PUT" ||
    raw === "PATCH" ||
    raw === "DELETE"
  ) {
    return raw;
  }
  return "GET";
}

function dateRangeSince(range: AdminApiUsageFilters["dateRange"]): string | null {
  if (!range || range === "all") {
    return null;
  }
  const now = new Date();
  if (range === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (range === "7d") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (range === "30d") {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }
  return null;
}

function sanitizeMetadata(raw: Record<string, unknown> | null): Record<string, unknown> {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("authorization") ||
      lower.includes("api_key") ||
      lower.includes("key_hash") ||
      lower.includes("password") ||
      lower.includes("secret")
    ) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function messagePreview(text: string, max = 48): string {
  const t = text.trim();
  if (t.length <= max) {
    return t;
  }
  return `${t.slice(0, max)}…`;
}

async function loadKeyMetaMap(
  keyIds: string[],
): Promise<Map<string, { name: string; key_masked: string }>> {
  const map = new Map<string, { name: string; key_masked: string }>();
  if (!keyIds.length) {
    return map;
  }
  const { data, error } = await getSupabase()
    .from("client_api_keys")
    .select("id, name, key_masked")
    .in("id", keyIds);
  if (error && !isMissingTableError(error)) {
    wrapSupabaseError(error, "loadKeyMetaMap");
  }
  for (const row of data ?? []) {
    map.set(row.id as string, {
      name: row.name as string,
      key_masked: row.key_masked as string,
    });
  }
  return map;
}

function matchesSearch(
  item: {
    requestId?: string;
    endpoint?: string;
    errorCode?: string | null;
    companyName?: string | null;
    apiKeyMasked?: string | null;
    apiKeyName?: string | null;
    name?: string;
  },
  search: string,
): boolean {
  const q = search.toLowerCase();
  const hay = [
    item.requestId,
    item.endpoint,
    item.errorCode,
    item.companyName,
    item.apiKeyMasked,
    item.apiKeyName,
    item.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function rowToRequestListItem(
  row: ClientApiRequestRow,
  companyNames: Map<string, string>,
  keyMeta: Map<string, { name: string; key_masked: string }>,
): AdminApiRequestListItem {
  const key = row.api_key_id ? keyMeta.get(row.api_key_id) : undefined;
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_id ? companyNames.get(row.company_id) ?? null : null,
    apiKeyId: row.api_key_id,
    apiKeyName: key?.name ?? null,
    apiKeyMasked: key?.key_masked ?? null,
    requestId: row.request_id,
    endpoint: row.endpoint,
    method: parseMethod(row.method),
    environment:
      row.environment === "production"
        ? "production"
        : row.environment === "sandbox"
          ? "sandbox"
          : null,
    statusCode: row.status_code,
    success: row.success,
    errorCode: row.error_code,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  };
}

export async function getAdminApiUsageModuleState(): Promise<AdminApiUsageModuleState> {
  const [requests, keys, messages] = await Promise.all([
    getClientApiRequestsModuleState(),
    getClientApiKeysModuleState(),
    getSmsApiMessagesModuleState(),
  ]);
  return {
    requestsAvailable: requests.available,
    keysAvailable: keys.available,
    messagesAvailable: messages.available,
    migrationPending:
      requests.migrationPending || keys.migrationPending || messages.migrationPending,
  };
}

export async function getAdminApiUsageStats(): Promise<AdminApiUsageStats> {
  const empty: AdminApiUsageStats = {
    requestsLast24h: 0,
    errorsLast24h: 0,
    activeApiKeys: 0,
    sandboxMessages: 0,
    companiesWithActivity: 0,
  };

  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [reqRes, keyRes, msgRes] = await Promise.all([
      getSupabase()
        .from("client_api_requests")
        .select("success, company_id")
        .gte("created_at", since24h),
      getSupabase()
        .from("client_api_keys")
        .select("id")
        .eq("status", "active"),
      getSupabase()
        .from("sms_api_messages")
        .select("id", { count: "exact", head: true })
        .eq("environment", "sandbox"),
    ]);

    if (reqRes.error && !isMissingTableError(reqRes.error)) {
      wrapSupabaseError(reqRes.error, "getAdminApiUsageStats.requests");
    }
    if (keyRes.error && !isMissingTableError(keyRes.error)) {
      wrapSupabaseError(keyRes.error, "getAdminApiUsageStats.keys");
    }
    if (msgRes.error && !isMissingTableError(msgRes.error)) {
      wrapSupabaseError(msgRes.error, "getAdminApiUsageStats.messages");
    }

    const reqRows = reqRes.data ?? [];
    let errorsLast24h = 0;
    const companies = new Set<string>();
    for (const row of reqRows) {
      if (row.success === false) {
        errorsLast24h++;
      }
      if (typeof row.company_id === "string") {
        companies.add(row.company_id);
      }
    }

    return {
      requestsLast24h: reqRows.length,
      errorsLast24h,
      activeApiKeys: keyRes.data?.length ?? 0,
      sandboxMessages: msgRes.count ?? 0,
      companiesWithActivity: companies.size,
    };
  } catch (error) {
    console.warn("[admin-api-usage] getAdminApiUsageStats", error);
    return empty;
  }
}

export async function listAdminApiRequests(
  filters: AdminApiUsageFilters,
  companyNames: Map<string, string>,
  limit = 100,
): Promise<AdminApiRequestListItem[]> {
  try {
    let query = getSupabase()
      .from("client_api_requests")
      .select(REQUEST_SELECT)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 200));

    if (filters.companyId) {
      query = query.eq("company_id", filters.companyId);
    }
    if (filters.endpoint?.trim()) {
      query = query.ilike("endpoint", `%${filters.endpoint.trim()}%`);
    }
    if (filters.method && filters.method !== "all") {
      query = query.eq("method", filters.method);
    }
    if (filters.statusCode) {
      query = query.eq("status_code", filters.statusCode);
    }
    if (filters.errorCode?.trim()) {
      query = query.eq("error_code", filters.errorCode.trim());
    }
    if (filters.environment && filters.environment !== "all") {
      query = query.eq("environment", filters.environment);
    }
    if (filters.success === true) {
      query = query.eq("success", true);
    } else if (filters.success === false) {
      query = query.eq("success", false);
    }

    const since = dateRangeSince(filters.dateRange);
    if (since) {
      query = query.gte("created_at", since);
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingTableError(error)) {
        return [];
      }
      wrapSupabaseError(error, "listAdminApiRequests");
    }

    const rows = (data ?? []) as ClientApiRequestRow[];
    const keyIds = [...new Set(rows.map((r) => r.api_key_id).filter(Boolean))] as string[];
    const keyMeta = await loadKeyMetaMap(keyIds);

    let items = rows.map((row) => rowToRequestListItem(row, companyNames, keyMeta));

    if (filters.search?.trim()) {
      items = items.filter((item) => matchesSearch(item, filters.search!.trim()));
    }

    return items;
  } catch (error) {
    console.warn("[admin-api-usage] listAdminApiRequests", error);
    return [];
  }
}

export async function getAdminApiRequestDetail(
  requestId: string,
  companyNames: Map<string, string>,
): Promise<AdminApiRequestDetail | null> {
  try {
    const { data, error } = await getSupabase()
      .from("client_api_requests")
      .select(REQUEST_SELECT)
      .eq("request_id", requestId)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        return null;
      }
      wrapSupabaseError(error, "getAdminApiRequestDetail");
    }
    if (!data) {
      return null;
    }

    const row = data as ClientApiRequestRow;
    const keyMeta = row.api_key_id
      ? await loadKeyMetaMap([row.api_key_id])
      : new Map();
    const base = rowToRequestListItem(row, companyNames, keyMeta);

    return {
      ...base,
      errorMessage: row.error_message,
      metadata: sanitizeMetadata(row.metadata),
    };
  } catch (error) {
    console.warn("[admin-api-usage] getAdminApiRequestDetail", error);
    return null;
  }
}

export async function listAdminApiKeys(
  filters: AdminApiUsageFilters,
  companyNames: Map<string, string>,
  limit = 100,
): Promise<AdminApiKeyListItem[]> {
  try {
    let query = getSupabase()
      .from("client_api_keys")
      .select(KEY_SELECT)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 200));

    if (filters.companyId) {
      query = query.eq("company_id", filters.companyId);
    }
    if (filters.environment && filters.environment !== "all") {
      query = query.eq("environment", filters.environment);
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingTableError(error)) {
        return [];
      }
      wrapSupabaseError(error, "listAdminApiKeys");
    }

    let items = ((data ?? []) as ClientApiKeyRow[]).map((row) => {
      const key = rowToClientApiKey(row);
      return {
        id: key.id,
        companyId: key.companyId,
        companyName: companyNames.get(key.companyId) ?? null,
        name: key.name,
        keyMasked: key.keyMasked,
        keyPrefix: key.keyPrefix,
        environment: key.environment,
        status: key.status,
        scopes: key.scopes,
        lastUsedAt: key.lastUsedAt,
        createdAt: key.createdAt,
      };
    });

    if (filters.search?.trim()) {
      items = items.filter((item) => matchesSearch(item, filters.search!.trim()));
    }

    return items;
  } catch (error) {
    console.warn("[admin-api-usage] listAdminApiKeys", error);
    return [];
  }
}

export async function fetchAdminApiKeyRowById(
  keyId: string,
): Promise<ClientApiKeyRow | null> {
  const { data, error } = await getSupabase()
    .from("client_api_keys")
    .select(KEY_SELECT)
    .eq("id", keyId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "fetchAdminApiKeyRowById");
  }
  return (data as ClientApiKeyRow | null) ?? null;
}

export async function listAdminSmsApiMessages(
  filters: AdminApiUsageFilters,
  companyNames: Map<string, string>,
  limit = 50,
): Promise<AdminSmsApiMessageListItem[]> {
  try {
    let query = getSupabase()
      .from("sms_api_messages")
      .select(
        "id, company_id, recipient, sender, message, segments, status, environment, external_reference, cost_sms, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 100));

    if (filters.companyId) {
      query = query.eq("company_id", filters.companyId);
    }
    if (filters.environment && filters.environment !== "all") {
      query = query.eq("environment", filters.environment);
    }

    const since = dateRangeSince(filters.dateRange);
    if (since) {
      query = query.gte("created_at", since);
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingTableError(error)) {
        return [];
      }
      wrapSupabaseError(error, "listAdminSmsApiMessages");
    }

    let items = ((data ?? []) as SmsApiMessageRow[]).map((row) => {
      const msg = rowToSmsApiMessage(row);
      return {
        id: msg.id,
        companyId: msg.companyId,
        companyName: companyNames.get(msg.companyId) ?? null,
        recipient: msg.recipient,
        sender: msg.sender,
        messagePreview: messagePreview(msg.message),
        segments: msg.segments,
        status: msg.status,
        environment: msg.environment,
        externalReference: msg.externalReference,
        costSms: msg.costSms,
        createdAt: msg.createdAt,
      };
    });

    if (filters.search?.trim()) {
      items = items.filter((item) =>
        matchesSearch(
          {
            companyName: item.companyName,
            endpoint: item.externalReference ?? undefined,
            requestId: item.recipient,
          },
          filters.search!.trim(),
        ),
      );
    }

    return items;
  } catch (error) {
    console.warn("[admin-api-usage] listAdminSmsApiMessages", error);
    return [];
  }
}

export async function getAdminSmsApiMessageDetail(
  messageId: string,
  companyNames: Map<string, string>,
): Promise<AdminSmsApiMessageDetail | null> {
  try {
    const { data, error } = await getSupabase()
      .from("sms_api_messages")
      .select("*")
      .eq("id", messageId)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        return null;
      }
      wrapSupabaseError(error, "getAdminSmsApiMessageDetail");
    }
    if (!data) {
      return null;
    }

    const row = data as SmsApiMessageRow;
    const msg = rowToSmsApiMessage(row);

    return {
      id: msg.id,
      companyId: msg.companyId,
      companyName: companyNames.get(msg.companyId) ?? null,
      recipient: msg.recipient,
      sender: msg.sender,
      country: msg.country,
      message: msg.message,
      segments: msg.segments,
      status: msg.status,
      environment: msg.environment,
      costSms: msg.costSms,
      externalReference: msg.externalReference,
      idempotencyKey: row.idempotency_key,
      providerMessageId: msg.providerMessageId,
      dlrStatus: msg.dlrStatus,
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt,
    };
  } catch (error) {
    console.warn("[admin-api-usage] getAdminSmsApiMessageDetail", error);
    return null;
  }
}
