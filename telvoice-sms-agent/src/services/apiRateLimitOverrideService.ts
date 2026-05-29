import { getSupabase } from "../database/supabaseClient.js";
import type { ApiRateLimitConfig } from "../types/api-rate-limit.js";
import type {
  AdminRateLimitOverrideFilters,
  AdminRateLimitOverrideListItem,
  ApiRateLimitOverrideAuditEntry,
  ApiRateLimitOverrideContext,
  ApiRateLimitOverrideRow,
  ApiRateLimitOverrideStatus,
  CreateAdminRateLimitOverrideInput,
  UpdateAdminRateLimitOverridePatch,
} from "../types/api-rate-limit-overrides.js";
import type { ClientApiKeyEnvironment } from "../types/client-api-keys.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { getRateLimitConfig as getBaseRateLimitConfig } from "./apiRateLimitService.js";

const OVERRIDE_SELECT =
  "id, company_id, api_key_id, environment, limit_per_minute, limit_per_day, status, reason, created_by_admin_id, metadata, source, created_at, updated_at";

function newAuditId(): string {
  return `rl_audit_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function rowToOverride(row: Record<string, unknown>): ApiRateLimitOverrideRow {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    api_key_id: (row.api_key_id as string | null) ?? null,
    environment: row.environment as ClientApiKeyEnvironment,
    limit_per_minute: row.limit_per_minute as number | null,
    limit_per_day: row.limit_per_day as number | null,
    status: row.status as ApiRateLimitOverrideStatus,
    reason: (row.reason as string | null) ?? null,
    created_by_admin_id: (row.created_by_admin_id as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    source: row.source as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function parseAuditLog(metadata: Record<string, unknown>): ApiRateLimitOverrideAuditEntry[] {
  const raw = metadata.audit_log;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (item): item is ApiRateLimitOverrideAuditEntry =>
      !!item &&
      typeof item === "object" &&
      typeof (item as ApiRateLimitOverrideAuditEntry).action === "string",
  );
}

function appendAudit(
  metadata: Record<string, unknown>,
  entry: Omit<ApiRateLimitOverrideAuditEntry, "id" | "at"> & { at?: string },
): Record<string, unknown> {
  const audit_log = [
    ...parseAuditLog(metadata),
    {
      id: newAuditId(),
      at: entry.at ?? new Date().toISOString(),
      ...entry,
    },
  ];
  return { ...metadata, audit_log };
}

function snapshotOverride(row: ApiRateLimitOverrideRow): Record<string, unknown> {
  return {
    limit_per_minute: row.limit_per_minute,
    limit_per_day: row.limit_per_day,
    status: row.status,
    reason: row.reason,
    environment: row.environment,
    api_key_id: row.api_key_id,
  };
}

export async function getRateLimitOverridesModuleState(): Promise<{
  available: boolean;
  migrationPending: boolean;
}> {
  const { error } = await getSupabase()
    .from("client_api_rate_limit_overrides")
    .select("id", { count: "exact", head: true })
    .limit(1);
  if (error) {
    if (isMissingTableError(error)) {
      return { available: false, migrationPending: true };
    }
    console.warn("[rate-limit-override] module state", error);
    return { available: false, migrationPending: false };
  }
  return { available: true, migrationPending: false };
}

async function fetchActiveOverride(
  companyId: string,
  apiKeyId: string | null,
  environment: ClientApiKeyEnvironment,
): Promise<ApiRateLimitOverrideRow | null> {
  let query = getSupabase()
    .from("client_api_rate_limit_overrides")
    .select(OVERRIDE_SELECT)
    .eq("company_id", companyId)
    .eq("environment", environment)
    .eq("status", "active")
    .limit(1);

  if (apiKeyId) {
    query = query.eq("api_key_id", apiKeyId);
  } else {
    query = query.is("api_key_id", null);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "fetchActiveOverride");
  }
  return data ? rowToOverride(data as Record<string, unknown>) : null;
}

export async function getRateLimitOverrideForContext(
  companyId: string,
  apiKeyId: string,
  environment: ClientApiKeyEnvironment,
): Promise<ApiRateLimitOverrideContext> {
  try {
    const [keyOverride, companyOverride] = await Promise.all([
      fetchActiveOverride(companyId, apiKeyId, environment),
      fetchActiveOverride(companyId, null, environment),
    ]);
    return { keyOverride, companyOverride };
  } catch (error) {
    console.warn("[rate-limit-override] getRateLimitOverrideForContext", error);
    return { keyOverride: null, companyOverride: null };
  }
}

export async function getEffectiveRateLimitConfig(
  companyId: string,
  apiKeyId: string,
  environment: ClientApiKeyEnvironment,
): Promise<ApiRateLimitConfig> {
  const base = getBaseRateLimitConfig(environment);
  try {
    const { keyOverride, companyOverride } = await getRateLimitOverrideForContext(
      companyId,
      apiKeyId,
      environment,
    );

    return {
      perMinutePerApiKey:
        keyOverride?.limit_per_minute ??
        companyOverride?.limit_per_minute ??
        base.perMinutePerApiKey,
      perDayPerCompany:
        keyOverride?.limit_per_day ??
        companyOverride?.limit_per_day ??
        base.perDayPerCompany,
    };
  } catch (error) {
    console.warn("[rate-limit-override] getEffectiveRateLimitConfig fallback", error);
    return base;
  }
}

async function deactivateActiveOverrides(input: {
  companyId: string;
  apiKeyId: string | null;
  environment: ClientApiKeyEnvironment;
  adminId: string;
  adminEmail: string;
  adminName: string;
  reason: string;
}): Promise<void> {
  let query = getSupabase()
    .from("client_api_rate_limit_overrides")
    .select(OVERRIDE_SELECT)
    .eq("company_id", input.companyId)
    .eq("environment", input.environment)
    .eq("status", "active");

  if (input.apiKeyId) {
    query = query.eq("api_key_id", input.apiKeyId);
  } else {
    query = query.is("api_key_id", null);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) {
      return;
    }
    wrapSupabaseError(error, "deactivateActiveOverrides");
  }

  for (const row of data ?? []) {
    const current = rowToOverride(row as Record<string, unknown>);
    const metadata = appendAudit(current.metadata, {
      action: "disabled",
      adminId: input.adminId,
      adminEmail: input.adminEmail,
      adminName: input.adminName,
      previous: snapshotOverride(current),
      next: { status: "disabled" },
    });
    const { error: updErr } = await getSupabase()
      .from("client_api_rate_limit_overrides")
      .update({ status: "disabled", metadata, reason: input.reason })
      .eq("id", current.id);
    if (updErr && !isMissingTableError(updErr)) {
      wrapSupabaseError(updErr, "deactivateActiveOverrides.update");
    }
  }
}

function validateLimits(
  limitPerMinute?: number | null,
  limitPerDay?: number | null,
): string | null {
  const hasMinute = limitPerMinute != null && limitPerMinute > 0;
  const hasDay = limitPerDay != null && limitPerDay > 0;
  if (!hasMinute && !hasDay) {
    return "Debe definir al menos un límite positivo (por minuto o por día).";
  }
  if (limitPerMinute != null && limitPerMinute <= 0) {
    return "Límite por minuto debe ser positivo.";
  }
  if (limitPerDay != null && limitPerDay <= 0) {
    return "Límite por día debe ser positivo.";
  }
  return null;
}

async function assertApiKeyBelongsToCompany(
  apiKeyId: string,
  companyId: string,
): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("client_api_keys")
    .select("id")
    .eq("id", apiKeyId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error && !isMissingTableError(error)) {
    wrapSupabaseError(error, "assertApiKeyBelongsToCompany");
  }
  return !!data;
}

export async function listAdminRateLimitOverrides(
  filters: AdminRateLimitOverrideFilters,
  companyNames: Map<string, string>,
  limit = 100,
): Promise<AdminRateLimitOverrideListItem[]> {
  try {
    let query = getSupabase()
      .from("client_api_rate_limit_overrides")
      .select(OVERRIDE_SELECT)
      .order("updated_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 200));

    if (filters.companyId) {
      query = query.eq("company_id", filters.companyId);
    }
    if (filters.environment && filters.environment !== "all") {
      query = query.eq("environment", filters.environment);
    }
    if (filters.status && filters.status !== "all") {
      query = query.eq("status", filters.status);
    } else {
      query = query.neq("status", "disabled");
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingTableError(error)) {
        return [];
      }
      wrapSupabaseError(error, "listAdminRateLimitOverrides");
    }

    const keyIds = [
      ...new Set(
        (data ?? [])
          .map((r) => r.api_key_id as string | null)
          .filter((id): id is string => !!id),
      ),
    ];
    const keyMeta = new Map<string, { name: string; key_masked: string }>();
    if (keyIds.length) {
      const { data: keys } = await getSupabase()
        .from("client_api_keys")
        .select("id, name, key_masked")
        .in("id", keyIds);
      for (const k of keys ?? []) {
        keyMeta.set(k.id as string, {
          name: k.name as string,
          key_masked: k.key_masked as string,
        });
      }
    }

    return (data ?? []).map((row) => {
      const o = rowToOverride(row as Record<string, unknown>);
      const key = o.api_key_id ? keyMeta.get(o.api_key_id) : undefined;
      return {
        id: o.id,
        companyId: o.company_id,
        companyName: companyNames.get(o.company_id) ?? null,
        apiKeyId: o.api_key_id,
        apiKeyName: key?.name ?? null,
        apiKeyMasked: key?.key_masked ?? null,
        environment: o.environment,
        limitPerMinute: o.limit_per_minute,
        limitPerDay: o.limit_per_day,
        status: o.status,
        reason: o.reason,
        updatedAt: o.updated_at,
        createdAt: o.created_at,
      };
    });
  } catch (error) {
    console.warn("[rate-limit-override] listAdminRateLimitOverrides", error);
    return [];
  }
}

export async function createAdminRateLimitOverride(
  input: CreateAdminRateLimitOverrideInput,
): Promise<{ ok: true; override: AdminRateLimitOverrideListItem } | { ok: false; error: string }> {
  const limitErr = validateLimits(input.limitPerMinute, input.limitPerDay);
  if (limitErr) {
    return { ok: false, error: limitErr };
  }

  if (input.apiKeyId) {
    const belongs = await assertApiKeyBelongsToCompany(input.apiKeyId, input.companyId);
    if (!belongs) {
      return { ok: false, error: "La API Key no pertenece a la empresa seleccionada." };
    }
  }

  await deactivateActiveOverrides({
    companyId: input.companyId,
    apiKeyId: input.apiKeyId ?? null,
    environment: input.environment,
    adminId: input.adminId,
    adminEmail: input.adminEmail,
    adminName: input.adminName,
    reason: "Reemplazado por nuevo override activo",
  });

  const metadata = appendAudit({}, {
    action: "created",
    adminId: input.adminId,
    adminEmail: input.adminEmail,
    adminName: input.adminName,
    next: {
      limit_per_minute: input.limitPerMinute ?? null,
      limit_per_day: input.limitPerDay ?? null,
      environment: input.environment,
      api_key_id: input.apiKeyId ?? null,
      status: "active",
    },
  });

  const { data, error } = await getSupabase()
    .from("client_api_rate_limit_overrides")
    .insert({
      company_id: input.companyId,
      api_key_id: input.apiKeyId ?? null,
      environment: input.environment,
      limit_per_minute: input.limitPerMinute ?? null,
      limit_per_day: input.limitPerDay ?? null,
      status: "active",
      reason: input.reason?.trim() || null,
      created_by_admin_id: input.adminId,
      metadata,
      source: "admin_panel",
    })
    .select(OVERRIDE_SELECT)
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, error: "Tabla de overrides no disponible (migración pendiente)." };
    }
    wrapSupabaseError(error, "createAdminRateLimitOverride");
  }

  const row = rowToOverride(data as Record<string, unknown>);
  return {
    ok: true,
    override: {
      id: row.id,
      companyId: row.company_id,
      companyName: null,
      apiKeyId: row.api_key_id,
      apiKeyName: null,
      apiKeyMasked: null,
      environment: row.environment,
      limitPerMinute: row.limit_per_minute,
      limitPerDay: row.limit_per_day,
      status: row.status,
      reason: row.reason,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    },
  };
}

export async function updateAdminRateLimitOverride(
  id: string,
  patch: UpdateAdminRateLimitOverridePatch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing, error: findErr } = await getSupabase()
    .from("client_api_rate_limit_overrides")
    .select(OVERRIDE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (findErr) {
    if (isMissingTableError(findErr)) {
      return { ok: false, error: "Tabla de overrides no disponible." };
    }
    wrapSupabaseError(findErr, "updateAdminRateLimitOverride.find");
  }
  if (!existing) {
    return { ok: false, error: "Override no encontrado." };
  }

  const current = rowToOverride(existing as Record<string, unknown>);
  const nextMinute =
    patch.limitPerMinute !== undefined ? patch.limitPerMinute : current.limit_per_minute;
  const nextDay = patch.limitPerDay !== undefined ? patch.limitPerDay : current.limit_per_day;
  const limitErr = validateLimits(nextMinute, nextDay);
  if (limitErr) {
    return { ok: false, error: limitErr };
  }

  const nextStatus = patch.status ?? current.status;
  const metadata = appendAudit(current.metadata, {
    action: patch.status === "disabled" ? "disabled" : "updated",
    adminId: patch.adminId,
    adminEmail: patch.adminEmail,
    adminName: patch.adminName,
    previous: snapshotOverride(current),
    next: {
      limit_per_minute: nextMinute,
      limit_per_day: nextDay,
      status: nextStatus,
      reason: patch.reason ?? current.reason,
    },
  });

  const { error: updErr } = await getSupabase()
    .from("client_api_rate_limit_overrides")
    .update({
      limit_per_minute: nextMinute,
      limit_per_day: nextDay,
      status: nextStatus,
      reason: patch.reason !== undefined ? patch.reason?.trim() || null : current.reason,
      metadata,
    })
    .eq("id", id);

  if (updErr) {
    wrapSupabaseError(updErr, "updateAdminRateLimitOverride.update");
  }
  return { ok: true };
}

export async function disableAdminRateLimitOverride(
  id: string,
  admin: { adminId: string; adminEmail: string; adminName: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  return updateAdminRateLimitOverride(id, {
    status: "disabled",
    adminId: admin.adminId,
    adminEmail: admin.adminEmail,
    adminName: admin.adminName,
  });
}

export async function listCompanyApiKeysForOverride(
  companyId: string,
): Promise<Array<{ id: string; name: string; keyMasked: string; environment: ClientApiKeyEnvironment }>> {
  const { data, error } = await getSupabase()
    .from("client_api_keys")
    .select("id, name, key_masked, environment, status")
    .eq("company_id", companyId)
    .neq("status", "revoked")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listCompanyApiKeysForOverride");
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    keyMasked: row.key_masked as string,
    environment: row.environment as ClientApiKeyEnvironment,
  }));
}
