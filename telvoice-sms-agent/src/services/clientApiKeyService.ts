import { getSupabase } from "../database/supabaseClient.js";
import {
  assertApiKeyPepperConfigured,
  extractKeyPrefix,
  generateApiKey,
  hashApiKey,
  isApiKeyPepperConfigured,
  maskApiKey,
  safeCompareApiKeyHash,
} from "./apiKeyCryptoService.js";
import type {
  ApiKeyAuthResult,
  ClientApiKey,
  ClientApiKeyEnvironment,
  ClientApiKeyRow,
  ClientApiKeyScope,
  ClientApiKeyServiceResult,
  ClientApiKeysModuleState,
  CreateClientApiKeyInput,
  CreatedClientApiKeyResult,
} from "../types/client-api-keys.js";
import { CLIENT_API_KEY_SCOPES } from "../types/client-api-keys.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { validateUuidParam } from "../utils/validation.js";

const KEY_LIST_COLUMNS =
  "id, company_id, created_by_user_id, name, key_prefix, key_masked, status, scopes, environment, last_used_at, expires_at, revoked_at, revoked_reason, metadata, source, created_at, updated_at, production_approved, production_approved_at, production_approved_by_admin_id, production_approval_notes";

type ApiKeyAuditEntry = {
  id: string;
  action: string;
  adminId: string;
  adminEmail: string;
  adminName: string;
  at: string;
  previous?: Record<string, unknown>;
  next?: Record<string, unknown>;
};

function newAuditId(): string {
  return `key_audit_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function parseAuditLog(metadata: Record<string, unknown> | null): ApiKeyAuditEntry[] {
  const raw = metadata?.audit_log;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is ApiKeyAuditEntry =>
      !!item && typeof item === "object" && typeof (item as ApiKeyAuditEntry).action === "string",
  );
}

function appendKeyAudit(
  metadata: Record<string, unknown> | null | undefined,
  entry: Omit<ApiKeyAuditEntry, "id" | "at"> & { at?: string },
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...metadata }
      : {};
  const audit_log = [
    ...parseAuditLog(base),
    { id: newAuditId(), at: entry.at ?? new Date().toISOString(), ...entry },
  ];
  return { ...base, audit_log };
}

function parseProductionApproved(row: ClientApiKeyRow): boolean {
  return row.production_approved === true;
}

function parseStatus(raw: string): ClientApiKey["status"] {
  if (raw === "active" || raw === "paused" || raw === "revoked" || raw === "expired") {
    return raw;
  }
  return "active";
}

function parseEnvironment(raw: string): ClientApiKeyEnvironment {
  return raw === "production" ? "production" : "sandbox";
}

function parseScopes(raw: unknown): ClientApiKeyScope[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: ClientApiKeyScope[] = [];
  for (const item of raw) {
    if (
      typeof item === "string" &&
      (CLIENT_API_KEY_SCOPES as readonly string[]).includes(item)
    ) {
      const scope = item as ClientApiKeyScope;
      if (!out.includes(scope)) {
        out.push(scope);
      }
    }
  }
  return out;
}

export function rowToClientApiKey(row: ClientApiKeyRow): ClientApiKey {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    keyPrefix: row.key_prefix,
    keyMasked: row.key_masked,
    status: parseStatus(row.status),
    scopes: parseScopes(row.scopes),
    environment: parseEnvironment(row.environment),
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revokedReason: row.revoked_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    productionApproved: parseProductionApproved(row),
    productionApprovedAt: row.production_approved_at ?? null,
    productionApprovedByAdminId: row.production_approved_by_admin_id ?? null,
    productionApprovalNotes: row.production_approval_notes ?? null,
  };
}

export function validateApiKeyScopes(scopes: unknown): ClientApiKeyScope[] {
  const parsed = parseScopes(scopes);
  if (!parsed.length) {
    throw new AppError("Debes seleccionar al menos un scope.", 400);
  }
  return parsed;
}

export function validateApiKeyName(name: unknown): string {
  const v = typeof name === "string" ? name.trim() : "";
  if (!v || v.length < 2) {
    throw new AppError("El nombre de la API Key debe tener al menos 2 caracteres.", 400);
  }
  if (v.length > 120) {
    throw new AppError("El nombre de la API Key es demasiado largo.", 400);
  }
  return v;
}

export function parseApiKeyEnvironment(raw: unknown): ClientApiKeyEnvironment {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "production" || v === "prod") {
    return "production";
  }
  return "sandbox";
}

export async function getClientApiKeysModuleState(): Promise<ClientApiKeysModuleState> {
  const { error } = await getSupabase()
    .from("client_api_keys")
    .select("id")
    .limit(1);

  if (error && isMissingTableError(error)) {
    return { available: false, migrationPending: true };
  }
  if (error) {
    console.warn("[client-api-keys] getClientApiKeysModuleState", error);
    return { available: false, migrationPending: false };
  }
  return { available: true, migrationPending: false };
}

async function fetchKeyRow(
  id: string,
  companyId: string,
): Promise<ClientApiKeyRow | null> {
  const { data, error } = await getSupabase()
    .from("client_api_keys")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "fetchKeyRow");
  }
  return (data as ClientApiKeyRow | null) ?? null;
}

export async function listClientApiKeys(
  companyId: string,
): Promise<ClientApiKeyServiceResult<ClientApiKey[]>> {
  try {
    const { data, error } = await getSupabase()
      .from("client_api_keys")
      .select(KEY_LIST_COLUMNS)
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false });

    if (error) {
      if (isMissingTableError(error)) {
        return {
          ok: false,
          error: "Tabla de API Keys no disponible.",
          missingTable: true,
        };
      }
      wrapSupabaseError(error, "listClientApiKeys");
    }

    const rows = (data ?? []) as ClientApiKeyRow[];
    return { ok: true, data: rows.map(rowToClientApiKey) };
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Error al listar API Keys.";
    console.warn("[client-api-keys] listClientApiKeys", error);
    return { ok: false, error: msg };
  }
}

export async function createClientApiKey(
  input: CreateClientApiKeyInput,
): Promise<ClientApiKeyServiceResult<CreatedClientApiKeyResult>> {
  try {
    assertApiKeyPepperConfigured();

    const name = validateApiKeyName(input.name);
    const scopes = validateApiKeyScopes(input.scopes);
    const environment = input.environment;

    let plainTextKey = "";
    let keyPrefix = "";
    let keyHash = "";
    let keyMasked = "";

    for (let attempt = 0; attempt < 5; attempt++) {
      plainTextKey = generateApiKey(environment);
      keyPrefix = extractKeyPrefix(plainTextKey);
      keyHash = hashApiKey(plainTextKey);
      keyMasked = maskApiKey(plainTextKey);
      const { data: existing } = await getSupabase()
        .from("client_api_keys")
        .select("id")
        .eq("key_prefix", keyPrefix)
        .maybeSingle();
      if (!existing) {
        break;
      }
      if (attempt === 4) {
        throw new AppError("No se pudo generar una API Key única.", 500);
      }
    }

    const { data, error } = await getSupabase()
      .from("client_api_keys")
      .insert({
        company_id: input.companyId,
        created_by_user_id: input.createdByUserId ?? null,
        name,
        key_prefix: keyPrefix,
        key_hash: keyHash,
        key_masked: keyMasked,
        status: "active",
        scopes,
        environment,
        expires_at: input.expiresAt ?? null,
        source: "client_panel",
      })
      .select(
        "id, company_id, created_by_user_id, name, key_prefix, key_masked, status, scopes, environment, last_used_at, expires_at, revoked_at, revoked_reason, metadata, source, created_at, updated_at",
      )
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        return {
          ok: false,
          error: "Tabla de API Keys no disponible.",
          missingTable: true,
        };
      }
      wrapSupabaseError(error, "createClientApiKey");
    }

    return {
      ok: true,
      data: {
        key: rowToClientApiKey(data as ClientApiKeyRow),
        plainTextKey,
      },
    };
  } catch (error) {
    if (error instanceof AppError) {
      return {
        ok: false,
        error: error.message,
        code: error.code,
      };
    }
    const msg =
      error instanceof Error ? error.message : "No se pudo crear la API Key.";
    console.warn("[client-api-keys] createClientApiKey", error);
    return { ok: false, error: msg };
  }
}

async function updateKeyStatus(
  id: string,
  companyId: string,
  patch: Record<string, unknown>,
): Promise<ClientApiKeyServiceResult<ClientApiKey>> {
  try {
    validateUuidParam(id, "api_key");
    const { data, error } = await getSupabase()
      .from("client_api_keys")
      .update(patch)
      .eq("id", id)
      .eq("company_id", companyId)
      .select(
        "id, company_id, created_by_user_id, name, key_prefix, key_masked, status, scopes, environment, last_used_at, expires_at, revoked_at, revoked_reason, metadata, source, created_at, updated_at",
      )
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        return {
          ok: false,
          error: "Tabla de API Keys no disponible.",
          missingTable: true,
        };
      }
      wrapSupabaseError(error, "updateKeyStatus");
    }
    if (!data) {
      return { ok: false, error: "API Key no encontrada." };
    }
    return { ok: true, data: rowToClientApiKey(data as ClientApiKeyRow) };
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "No se pudo actualizar la API Key.";
    return { ok: false, error: msg };
  }
}

export async function pauseClientApiKey(
  id: string,
  companyId: string,
): Promise<ClientApiKeyServiceResult<ClientApiKey>> {
  const row = await fetchKeyRow(id, companyId);
  if (!row) {
    return { ok: false, error: "API Key no encontrada." };
  }
  if (row.status === "revoked") {
    return { ok: false, error: "No se puede pausar una API Key revocada." };
  }
  if (row.status === "paused") {
    return { ok: true, data: rowToClientApiKey(row) };
  }
  return updateKeyStatus(id, companyId, { status: "paused" });
}

export async function activateClientApiKey(
  id: string,
  companyId: string,
): Promise<ClientApiKeyServiceResult<ClientApiKey>> {
  const row = await fetchKeyRow(id, companyId);
  if (!row) {
    return { ok: false, error: "API Key no encontrada." };
  }
  if (row.status === "revoked") {
    return { ok: false, error: "No se puede reactivar una API Key revocada." };
  }
  if (row.status === "active") {
    return { ok: true, data: rowToClientApiKey(row) };
  }
  return updateKeyStatus(id, companyId, { status: "active" });
}

export async function revokeClientApiKey(
  id: string,
  companyId: string,
  reason?: string | null,
): Promise<ClientApiKeyServiceResult<ClientApiKey>> {
  const row = await fetchKeyRow(id, companyId);
  if (!row) {
    return { ok: false, error: "API Key no encontrada." };
  }
  if (row.status === "revoked") {
    return { ok: true, data: rowToClientApiKey(row) };
  }
  return updateKeyStatus(id, companyId, {
    status: "revoked",
    revoked_at: new Date().toISOString(),
    revoked_reason: reason?.trim() || "Revocada por el cliente",
  });
}

export async function updateClientApiKeyScopes(
  id: string,
  companyId: string,
  scopes: ClientApiKeyScope[],
): Promise<ClientApiKeyServiceResult<ClientApiKey>> {
  const row = await fetchKeyRow(id, companyId);
  if (!row) {
    return { ok: false, error: "API Key no encontrada." };
  }
  if (row.status === "revoked") {
    return { ok: false, error: "No se pueden editar scopes de una key revocada." };
  }
  const validated = validateApiKeyScopes(scopes);
  return updateKeyStatus(id, companyId, { scopes: validated });
}

export async function updateClientApiKeyName(
  id: string,
  companyId: string,
  name: string,
): Promise<ClientApiKeyServiceResult<ClientApiKey>> {
  const row = await fetchKeyRow(id, companyId);
  if (!row) {
    return { ok: false, error: "API Key no encontrada." };
  }
  if (row.status === "revoked") {
    return { ok: false, error: "No se puede renombrar una API Key revocada." };
  }
  const validated = validateApiKeyName(name);
  return updateKeyStatus(id, companyId, { name: validated });
}

function parseBearerToken(header: string | undefined): string | null {
  if (!header || typeof header !== "string") {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match?.[1]) {
    return null;
  }
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

function isValidApiKeyFormat(token: string): boolean {
  if (!token.startsWith("tlv_test_") && !token.startsWith("tlv_live_")) {
    return false;
  }
  const suffix = token.startsWith("tlv_test_")
    ? token.slice("tlv_test_".length)
    : token.slice("tlv_live_".length);
  return suffix.length >= 8 && /^[a-z0-9]+$/.test(suffix);
}

function expectedEnvironmentFromToken(
  token: string,
): ClientApiKeyEnvironment | null {
  if (token.startsWith("tlv_test_")) {
    return "sandbox";
  }
  if (token.startsWith("tlv_live_")) {
    return "production";
  }
  return null;
}

function isKeyExpired(row: ClientApiKeyRow): boolean {
  if (row.status === "expired") {
    return true;
  }
  if (!row.expires_at) {
    return false;
  }
  const expires = new Date(row.expires_at);
  return !Number.isNaN(expires.getTime()) && expires.getTime() <= Date.now();
}

function resolvedKeyFromRow(row: ClientApiKeyRow) {
  return {
    apiKeyId: row.id,
    companyId: row.company_id,
    environment: parseEnvironment(row.environment),
  };
}

async function fetchKeyRowByPrefix(prefix: string): Promise<ClientApiKeyRow | null> {
  const { data, error } = await getSupabase()
    .from("client_api_keys")
    .select("*")
    .eq("key_prefix", prefix)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "fetchKeyRowByPrefix");
  }
  return (data as ClientApiKeyRow | null) ?? null;
}

export async function touchClientApiKeyLastUsed(id: string): Promise<void> {
  try {
    await getSupabase()
      .from("client_api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", id);
  } catch (error) {
    console.warn("[client-api-keys] touchClientApiKeyLastUsed", error);
  }
}

export async function authenticateClientApiKey(
  authorizationHeader: string | undefined,
  requiredScope: ClientApiKeyScope,
): Promise<ApiKeyAuthResult> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return {
      ok: false,
      statusCode: 401,
      code: "MISSING_API_KEY",
      message: "Authorization Bearer token is required.",
    };
  }

  if (!isValidApiKeyFormat(token)) {
    return {
      ok: false,
      statusCode: 401,
      code: "INVALID_API_KEY_FORMAT",
      message: "API Key format is invalid.",
    };
  }

  if (!isApiKeyPepperConfigured()) {
    return {
      ok: false,
      statusCode: 500,
      code: "INTERNAL_ERROR",
      message: "API authentication is not configured.",
    };
  }

  const keyPrefix = extractKeyPrefix(token);
  const row = await fetchKeyRowByPrefix(keyPrefix);
  if (!row) {
    return {
      ok: false,
      statusCode: 401,
      code: "INVALID_API_KEY",
      message: "API Key is invalid.",
    };
  }

  let computedHash: string;
  try {
    computedHash = hashApiKey(token);
  } catch {
    return {
      ok: false,
      statusCode: 500,
      code: "INTERNAL_ERROR",
      message: "API authentication failed.",
    };
  }

  if (!safeCompareApiKeyHash(computedHash, row.key_hash)) {
    return {
      ok: false,
      statusCode: 401,
      code: "INVALID_API_KEY",
      message: "API Key is invalid.",
    };
  }

  if (row.status === "paused") {
    return {
      ok: false,
      statusCode: 403,
      code: "API_KEY_PAUSED",
      message: "API Key is paused.",
      resolved: resolvedKeyFromRow(row),
    };
  }

  if (row.status === "revoked") {
    return {
      ok: false,
      statusCode: 403,
      code: "API_KEY_REVOKED",
      message: "API Key has been revoked.",
      resolved: resolvedKeyFromRow(row),
    };
  }

  if (isKeyExpired(row)) {
    return {
      ok: false,
      statusCode: 403,
      code: "API_KEY_EXPIRED",
      message: "API Key has expired.",
      resolved: resolvedKeyFromRow(row),
    };
  }

  if (row.status !== "active") {
    return {
      ok: false,
      statusCode: 401,
      code: "INVALID_API_KEY",
      message: "API Key is invalid.",
      resolved: resolvedKeyFromRow(row),
    };
  }

  const tokenEnvironment = expectedEnvironmentFromToken(token);
  const rowEnvironment = parseEnvironment(row.environment);
  if (
    !tokenEnvironment ||
    tokenEnvironment !== rowEnvironment ||
    (token.startsWith("tlv_test_") && rowEnvironment !== "sandbox") ||
    (token.startsWith("tlv_live_") && rowEnvironment !== "production")
  ) {
    return {
      ok: false,
      statusCode: 401,
      code: "INVALID_API_KEY",
      message: "API Key is invalid.",
      resolved: resolvedKeyFromRow(row),
    };
  }

  const scopes = parseScopes(row.scopes);
  if (!scopes.includes(requiredScope)) {
    return {
      ok: false,
      statusCode: 403,
      code: "INSUFFICIENT_SCOPE",
      message: `Required scope '${requiredScope}' is missing.`,
      resolved: resolvedKeyFromRow(row),
    };
  }

  return {
    ok: true,
    context: {
      apiKeyId: row.id,
      companyId: row.company_id,
      environment: rowEnvironment,
      scopes,
      keyPrefix: row.key_prefix,
      productionApproved:
        rowEnvironment === "production" ? parseProductionApproved(row) : false,
    },
  };
}

export async function fetchClientApiKeyById(
  keyId: string,
): Promise<ClientApiKeyRow | null> {
  const id = validateUuidParam(keyId, "id");
  const { data, error } = await getSupabase()
    .from("client_api_keys")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return null;
    wrapSupabaseError(error, "fetchClientApiKeyById");
  }
  return (data as ClientApiKeyRow | null) ?? null;
}

export type ProductionApprovalAdminActor = {
  adminId: string;
  adminEmail: string;
  adminName: string;
};

export async function listProductionPendingApiKeys(filters?: {
  companyId?: string;
  limit?: number;
}): Promise<ClientApiKey[]> {
  try {
    let query = getSupabase()
      .from("client_api_keys")
      .select(KEY_LIST_COLUMNS)
      .eq("environment", "production")
      .eq("production_approved", false)
      .neq("status", "revoked")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(filters?.limit ?? 100, 1), 200));

    if (filters?.companyId) {
      query = query.eq("company_id", filters.companyId);
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingTableError(error)) return [];
      wrapSupabaseError(error, "listProductionPendingApiKeys");
    }
    return (data ?? []).map((row) => rowToClientApiKey(row as ClientApiKeyRow));
  } catch (error) {
    console.warn("[client-api-keys] listProductionPendingApiKeys", error);
    return [];
  }
}

export async function approveProductionApiKey(
  keyId: string,
  admin: ProductionApprovalAdminActor,
  notes?: string | null,
): Promise<ClientApiKeyServiceResult<ClientApiKey>> {
  const row = await fetchClientApiKeyById(keyId);
  if (!row) {
    return { ok: false, error: "API Key no encontrada." };
  }
  if (parseEnvironment(row.environment) !== "production") {
    return { ok: false, error: "Solo se pueden aprobar API Keys de ambiente production." };
  }
  if (row.status === "revoked") {
    return { ok: false, error: "No se puede aprobar una API Key revocada." };
  }
  if (row.status === "paused") {
    return { ok: false, error: "Activa la API Key antes de aprobar production." };
  }
  if (row.status !== "active") {
    return { ok: false, error: "La API Key debe estar activa para aprobar production." };
  }

  const metadata = appendKeyAudit(row.metadata, {
    action: "production_approved",
    adminId: admin.adminId,
    adminEmail: admin.adminEmail,
    adminName: admin.adminName,
    previous: {
      production_approved: row.production_approved ?? false,
    },
    next: { production_approved: true },
  });

  const { data, error } = await getSupabase()
    .from("client_api_keys")
    .update({
      production_approved: true,
      production_approved_at: new Date().toISOString(),
      production_approved_by_admin_id: admin.adminId,
      production_approval_notes: notes?.trim() || null,
      metadata,
    })
    .eq("id", keyId)
    .select(KEY_LIST_COLUMNS)
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, error: "Tabla API Keys no disponible.", missingTable: true };
    }
    wrapSupabaseError(error, "approveProductionApiKey");
  }
  return { ok: true, data: rowToClientApiKey(data as ClientApiKeyRow) };
}

export async function revokeProductionApproval(
  keyId: string,
  admin: ProductionApprovalAdminActor,
  reason?: string | null,
): Promise<ClientApiKeyServiceResult<ClientApiKey>> {
  const row = await fetchClientApiKeyById(keyId);
  if (!row) {
    return { ok: false, error: "API Key no encontrada." };
  }
  if (parseEnvironment(row.environment) !== "production") {
    return { ok: false, error: "Solo aplica a API Keys production." };
  }

  const metadata = appendKeyAudit(row.metadata, {
    action: "production_approval_revoked",
    adminId: admin.adminId,
    adminEmail: admin.adminEmail,
    adminName: admin.adminName,
    previous: { production_approved: row.production_approved ?? false },
    next: { production_approved: false },
  });

  const { data, error } = await getSupabase()
    .from("client_api_keys")
    .update({
      production_approved: false,
      production_approved_at: null,
      production_approved_by_admin_id: null,
      production_approval_notes: reason?.trim() || null,
      metadata,
    })
    .eq("id", keyId)
    .select(KEY_LIST_COLUMNS)
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, error: "Tabla API Keys no disponible.", missingTable: true };
    }
    wrapSupabaseError(error, "revokeProductionApproval");
  }
  return { ok: true, data: rowToClientApiKey(data as ClientApiKeyRow) };
}
