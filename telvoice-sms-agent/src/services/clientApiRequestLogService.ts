import { getSupabase } from "../database/supabaseClient.js";
import type {
  ClientApiRequest,
  ClientApiRequestLogFilters,
  ClientApiRequestMethod,
  ClientApiRequestRow,
  ClientApiRequestStats,
  ClientApiRequestsModuleState,
  CreateClientApiRequestLogInput,
} from "../types/client-api-requests.js";
import type { ClientApiKeyEnvironment } from "../types/client-api-keys.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

function parseEnvironment(raw: string | null): ClientApiKeyEnvironment | null {
  if (raw === "production") {
    return "production";
  }
  if (raw === "sandbox") {
    return "sandbox";
  }
  return null;
}

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

function rowToClientApiRequest(
  row: ClientApiRequestRow,
  keyMeta?: { name?: string | null; key_masked?: string | null },
): ClientApiRequest {
  return {
    id: row.id,
    companyId: row.company_id,
    apiKeyId: row.api_key_id,
    requestId: row.request_id,
    endpoint: row.endpoint,
    method: parseMethod(row.method),
    environment: parseEnvironment(row.environment),
    statusCode: row.status_code,
    success: row.success,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    apiKeyName: keyMeta?.name ?? null,
    apiKeyMasked: keyMeta?.key_masked ?? null,
  };
}

export async function getClientApiRequestsModuleState(): Promise<ClientApiRequestsModuleState> {
  const { error } = await getSupabase()
    .from("client_api_requests")
    .select("id")
    .limit(1);

  if (error && isMissingTableError(error)) {
    return { available: false, migrationPending: true };
  }
  if (error) {
    console.warn("[client-api-requests] getClientApiRequestsModuleState", error);
    return { available: false, migrationPending: false };
  }
  return { available: true, migrationPending: false };
}

export async function createApiRequestLog(
  input: CreateClientApiRequestLogInput,
): Promise<void> {
  try {
    const { error } = await getSupabase().from("client_api_requests").insert({
      company_id: input.companyId ?? null,
      api_key_id: input.apiKeyId ?? null,
      request_id: input.requestId,
      endpoint: input.endpoint,
      method: input.method,
      environment: input.environment ?? null,
      status_code: input.statusCode,
      success: input.success,
      error_code: input.errorCode ?? null,
      error_message: input.errorMessage ?? null,
      ip_address: input.ipAddress ?? null,
      user_agent: input.userAgent ?? null,
      duration_ms: input.durationMs ?? null,
      metadata: input.metadata ?? {},
    });

    if (error) {
      if (isMissingTableError(error)) {
        return;
      }
      wrapSupabaseError(error, "createApiRequestLog");
    }
  } catch (error) {
    console.warn("[client-api-requests] createApiRequestLog", error);
  }
}

type RequestRowWithKey = ClientApiRequestRow;

async function queryRequestLogs(
  companyId: string,
  filters: ClientApiRequestLogFilters,
): Promise<ClientApiRequest[]> {
  const limit = Math.min(Math.max(filters.limit ?? 10, 1), 100);

  let query = getSupabase()
    .from("client_api_requests")
    .select(
      "id, company_id, api_key_id, request_id, endpoint, method, environment, status_code, success, error_code, error_message, ip_address, user_agent, duration_ms, metadata, created_at",
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.apiKeyId) {
    query = query.eq("api_key_id", filters.apiKeyId);
  }
  if (filters.success === true) {
    query = query.eq("success", true);
  } else if (filters.success === false) {
    query = query.eq("success", false);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "queryRequestLogs");
  }

  return ((data ?? []) as RequestRowWithKey[]).map((row) => rowToClientApiRequest(row));
}

export async function listApiRequestLogs(
  companyId: string,
  filters: ClientApiRequestLogFilters = {},
): Promise<ClientApiRequest[]> {
  try {
    return await queryRequestLogs(companyId, filters);
  } catch (error) {
    console.warn("[client-api-requests] listApiRequestLogs", error);
    return [];
  }
}

export async function listApiRequestLogsByApiKey(
  companyId: string,
  apiKeyId: string,
  filters: Omit<ClientApiRequestLogFilters, "apiKeyId"> = {},
): Promise<ClientApiRequest[]> {
  return listApiRequestLogs(companyId, { ...filters, apiKeyId });
}

export async function getApiRequestStats(
  companyId: string,
): Promise<ClientApiRequestStats> {
  const empty: ClientApiRequestStats = {
    total: 0,
    successCount: 0,
    errorCount: 0,
    last24h: 0,
  };

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await getSupabase()
      .from("client_api_requests")
      .select("success, created_at")
      .eq("company_id", companyId)
      .gte("created_at", since);

    if (error) {
      if (isMissingTableError(error)) {
        return empty;
      }
      wrapSupabaseError(error, "getApiRequestStats");
    }

    const rows = data ?? [];
    let successCount = 0;
    for (const row of rows) {
      if (row.success === true) {
        successCount++;
      }
    }
    return {
      total: rows.length,
      successCount,
      errorCount: rows.length - successCount,
      last24h: rows.length,
    };
  } catch (error) {
    console.warn("[client-api-requests] getApiRequestStats", error);
    return empty;
  }
}

export async function deleteApiRequestLogsForApiKeys(
  apiKeyIds: string[],
): Promise<void> {
  if (!apiKeyIds.length) {
    return;
  }
  try {
    await getSupabase()
      .from("client_api_requests")
      .delete()
      .in("api_key_id", apiKeyIds);
  } catch (error) {
    console.warn("[client-api-requests] deleteApiRequestLogsForApiKeys", error);
  }
}
