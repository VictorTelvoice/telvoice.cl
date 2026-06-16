import { getSupabase } from "../database/supabaseClient.js";
import { calculateSimpleApiSmsSegments } from "../utils/sms-api-segments.js";
import { hashSmsApiSendPayload } from "../utils/sms-api-payload-hash.js";
import type {
  CreateSandboxSmsApiMessageInput,
  SandboxSmsSendResolution,
  SmsApiMessage,
  SmsApiMessageEnvironment,
  SmsApiMessageListFilters,
  SmsApiMessageListResult,
  SmsApiMessageQueryError,
  SmsApiMessageRow,
  SmsApiMessageStatus,
  SmsApiMessagesModuleState,
  SmsApiSendPayload,
  SmsApiSendValidationError,
  ProductionSmsSendResolution,
} from "../types/sms-api-messages.js";
import { SMS_API_MESSAGE_STATUSES } from "../types/sms-api-messages.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { assertCompanyCanSendSms } from "./companySendGuardService.js";
import { assertApiTrafficAllowed } from "./smsDispatchWorkerService.js";
import { dispatchProviderSend } from "./smsProviderDispatchService.js";
import { resolveRouteForMessage } from "./smsRoutingService.js";
import { debitSmsUsage } from "./smsWalletService.js";
import { hasSmsDebitForApiMessage } from "./walletTransactionService.js";
import { assertDlrWebhookSafeForLiveTraffic } from "../utils/dlr-callback.js";
import { AppError } from "../utils/errors.js";
import { recordTpsSend } from "./smsTpsLimiterService.js";
import { isAsmscConfigured } from "./sms-providers/realApiProvider.js";

const MAX_MESSAGE_LENGTH = 918;
const MAX_SENDER_LENGTH = 11;
const MAX_EXTERNAL_REFERENCE_LENGTH = 120;
const MAX_IDEMPOTENCY_KEY_LENGTH = 120;
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export { SMS_API_MESSAGE_STATUSES };

export function isValidSmsApiMessageId(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

function parseStatus(raw: string): SmsApiMessageStatus {
  const allowed: SmsApiMessageStatus[] = [
    "sandbox_accepted",
    "sandbox_rejected",
    "pending",
    "sent",
    "delivered",
    "failed",
    "expired",
    "rejected",
  ];
  return (allowed.includes(raw as SmsApiMessageStatus)
    ? raw
    : "sandbox_accepted") as SmsApiMessageStatus;
}

function parseEnvironment(raw: string): SmsApiMessageEnvironment {
  return raw === "production" ? "production" : "sandbox";
}

export function rowToSmsApiMessage(row: SmsApiMessageRow): SmsApiMessage {
  return {
    id: row.id,
    companyId: row.company_id,
    apiKeyId: row.api_key_id,
    requestId: row.request_id,
    externalReference: row.external_reference,
    recipient: row.recipient,
    sender: row.sender,
    message: row.message,
    country: row.country,
    segments: row.segments,
    status: parseStatus(row.status),
    environment: parseEnvironment(row.environment),
    providerMessageId: row.provider_message_id,
    dlrStatus: row.dlr_status,
    costSms: row.cost_sms,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getSmsApiMessagesModuleState(): Promise<SmsApiMessagesModuleState> {
  const { error } = await getSupabase()
    .from("sms_api_messages")
    .select("id")
    .limit(1);

  if (error && isMissingTableError(error)) {
    return { available: false, migrationPending: true };
  }
  if (error) {
    console.warn("[sms-api-messages] getSmsApiMessagesModuleState", error);
    return { available: false, migrationPending: false };
  }
  return { available: true, migrationPending: false };
}

export function validateE164Recipient(to: unknown): {
  ok: true;
  normalized: string;
} | { ok: false; error: SmsApiSendValidationError } {
  if (Array.isArray(to)) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Bulk recipients are not supported in this phase.",
      },
    };
  }
  const raw = typeof to === "string" ? to.trim() : "";
  if (!raw.startsWith("+")) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        code: "INVALID_RECIPIENT",
        message: "Recipient must be in E.164 format starting with +.",
      },
    };
  }
  const digits = raw.slice(1);
  if (!/^\d+$/.test(digits) || digits.length < 8 || digits.length > 15) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        code: "INVALID_RECIPIENT",
        message: "Recipient must be a valid E.164 number.",
      },
    };
  }
  return { ok: true, normalized: raw };
}

export function validateIdempotencyKeyHeader(
  raw: unknown,
): { ok: true; value: string | null } | { ok: false; error: SmsApiSendValidationError } {
  if (raw === undefined || raw === null) {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string") {
    return {
      ok: false,
      error: {
        statusCode: 400,
        code: "INVALID_IDEMPOTENCY_KEY",
        message: "Idempotency-Key header is invalid.",
      },
    };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        code: "INVALID_IDEMPOTENCY_KEY",
        message: "Idempotency-Key must not be empty.",
      },
    };
  }
  if (trimmed.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        code: "INVALID_IDEMPOTENCY_KEY",
        message: "Idempotency-Key is too long.",
      },
    };
  }
  return { ok: true, value: trimmed };
}

export { hashSmsApiSendPayload };

export function validateSmsApiSendPayload(
  body: unknown,
): { ok: true; payload: SmsApiSendPayload; segments: number } | { ok: false; error: SmsApiSendValidationError } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        code: "INVALID_JSON",
        message: "Request body must be a JSON object.",
      },
    };
  }

  const o = body as Record<string, unknown>;

  if (Array.isArray(o.to)) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Bulk recipients are not supported in this phase.",
      },
    };
  }

  const recipient = validateE164Recipient(o.to);
  if (!recipient.ok) {
    return { ok: false, error: recipient.error };
  }

  if (Array.isArray(o.message)) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Message must be a string.",
      },
    };
  }

  const message = typeof o.message === "string" ? o.message.trim() : "";
  if (!message) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        code: "MESSAGE_REQUIRED",
        message: "Message is required.",
      },
    };
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        code: "MESSAGE_TOO_LONG",
        message: `Message must be at most ${MAX_MESSAGE_LENGTH} characters.`,
      },
    };
  }

  let sender: string | null = null;
  if (o.sender !== undefined && o.sender !== null && o.sender !== "") {
    if (typeof o.sender !== "string") {
      return {
        ok: false,
        error: {
          statusCode: 400,
          code: "INVALID_SENDER",
          message: "Sender must be a string.",
        },
      };
    }
    sender = o.sender.trim();
    if (sender.length > MAX_SENDER_LENGTH) {
      return {
        ok: false,
        error: {
          statusCode: 400,
          code: "INVALID_SENDER",
          message: `Sender must be at most ${MAX_SENDER_LENGTH} characters.`,
        },
      };
    }
  }

  let country: string | null = null;
  if (o.country !== undefined && o.country !== null && o.country !== "") {
    if (typeof o.country !== "string") {
      return {
        ok: false,
        error: {
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Country must be a string.",
        },
      };
    }
    country = o.country.trim().toUpperCase().slice(0, 2);
  }

  let externalReference: string | null = null;
  if (
    o.external_reference !== undefined &&
    o.external_reference !== null &&
    o.external_reference !== ""
  ) {
    if (typeof o.external_reference !== "string") {
      return {
        ok: false,
        error: {
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "external_reference must be a string.",
        },
      };
    }
    externalReference = o.external_reference.trim();
    if (externalReference.length > MAX_EXTERNAL_REFERENCE_LENGTH) {
      return {
        ok: false,
        error: {
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "external_reference is too long.",
        },
      };
    }
  }

  const segments = calculateSimpleApiSmsSegments(message);

  return {
    ok: true,
    payload: {
      to: recipient.normalized,
      message,
      sender,
      country,
      external_reference: externalReference,
    },
    segments,
  };
}

async function findIdempotentSmsMessage(
  companyId: string,
  apiKeyId: string,
  environment: SmsApiMessageEnvironment,
  idempotencyKey: string,
): Promise<SmsApiMessageRow | null> {
  const { data, error } = await getSupabase()
    .from("sms_api_messages")
    .select("*")
    .eq("company_id", companyId)
    .eq("api_key_id", apiKeyId)
    .eq("environment", environment)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "findIdempotentSmsMessage");
  }
  return (data as SmsApiMessageRow | null) ?? null;
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = (error as { code?: string }).code;
  return code === "23505";
}

export async function resolveSandboxSmsSend(
  input: CreateSandboxSmsApiMessageInput,
  payload: SmsApiSendPayload,
): Promise<SandboxSmsSendResolution> {
  await assertCompanyCanSendSms(input.companyId);

  const environment = input.environment ?? "sandbox";
  const payloadHash = input.payloadHash ?? hashSmsApiSendPayload(payload);

  if (input.idempotencyKey) {
    const existing = await findIdempotentSmsMessage(
      input.companyId,
      input.apiKeyId,
      environment,
      input.idempotencyKey,
    );
    if (existing) {
      if (existing.payload_hash === payloadHash) {
        return { outcome: "replay", message: rowToSmsApiMessage(existing) };
      }
      return { outcome: "conflict" };
    }
  }

  try {
    const message = await createSandboxSmsApiMessage({
      ...input,
      environment,
      payloadHash,
    });
    return { outcome: "created", message };
  } catch (error) {
    if (input.idempotencyKey && isUniqueViolation(error)) {
      const existing = await findIdempotentSmsMessage(
        input.companyId,
        input.apiKeyId,
        environment,
        input.idempotencyKey,
      );
      if (existing) {
        if (existing.payload_hash === payloadHash) {
          return { outcome: "replay", message: rowToSmsApiMessage(existing) };
        }
        return { outcome: "conflict" };
      }
    }
    throw error;
  }
}

export async function createSandboxSmsApiMessage(
  input: CreateSandboxSmsApiMessageInput,
): Promise<SmsApiMessage> {
  const environment = input.environment ?? "sandbox";
  const metadata: Record<string, unknown> = { sandbox: true };
  if (input.idempotencyKey) {
    metadata.idempotency_key = input.idempotencyKey;
  }

  const { data, error } = await getSupabase()
    .from("sms_api_messages")
    .insert({
      company_id: input.companyId,
      api_key_id: input.apiKeyId,
      request_id: input.requestId,
      external_reference: input.externalReference ?? null,
      recipient: input.recipient,
      sender: input.sender ?? null,
      message: input.message,
      country: input.country ?? null,
      segments: input.segments,
      status: "sandbox_accepted",
      environment,
      provider_message_id: null,
      dlr_status: null,
      cost_sms: 0,
      idempotency_key: input.idempotencyKey ?? null,
      payload_hash: input.payloadHash ?? null,
      metadata,
    })
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error("SMS API messages table not available.");
    }
    if (isUniqueViolation(error)) {
      throw error;
    }
    wrapSupabaseError(error, "createSandboxSmsApiMessage");
  }

  return rowToSmsApiMessage(data as SmsApiMessageRow);
}

async function updateSmsApiMessageRow(
  messageId: string,
  companyId: string,
  patch: Partial<{
    status: SmsApiMessageStatus;
    provider_message_id: string | null;
    dlr_status: string | null;
    cost_sms: number;
    metadata: Record<string, unknown>;
  }>,
): Promise<SmsApiMessage> {
  const { data, error } = await getSupabase()
    .from("sms_api_messages")
    .update(patch)
    .eq("id", messageId)
    .eq("company_id", companyId)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "updateSmsApiMessageRow");
  }

  return rowToSmsApiMessage(data as SmsApiMessageRow);
}

async function createProductionSmsApiMessage(
  input: CreateSandboxSmsApiMessageInput,
): Promise<SmsApiMessage> {
  const metadata: Record<string, unknown> = {
    source: "public_api",
    mode: "production",
  };
  if (input.idempotencyKey) {
    metadata.idempotency_key = input.idempotencyKey;
  }

  const { data, error } = await getSupabase()
    .from("sms_api_messages")
    .insert({
      company_id: input.companyId,
      api_key_id: input.apiKeyId,
      request_id: input.requestId,
      external_reference: input.externalReference ?? null,
      recipient: input.recipient,
      sender: input.sender ?? null,
      message: input.message,
      country: input.country ?? null,
      segments: input.segments,
      status: "pending",
      environment: "production",
      provider_message_id: null,
      dlr_status: null,
      cost_sms: input.segments,
      idempotency_key: input.idempotencyKey ?? null,
      payload_hash: input.payloadHash ?? null,
      metadata,
    })
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error("SMS API messages table not available.");
    }
    if (isUniqueViolation(error)) {
      throw error;
    }
    wrapSupabaseError(error, "createProductionSmsApiMessage");
  }

  return rowToSmsApiMessage(data as SmsApiMessageRow);
}

export async function resolveProductionSmsSend(
  input: CreateSandboxSmsApiMessageInput,
  payload: SmsApiSendPayload,
): Promise<ProductionSmsSendResolution> {
  if (!isAsmscConfigured()) {
    throw new AppError("Proveedor SMS no disponible.", 503);
  }

  await assertCompanyCanSendSms(input.companyId);

  const environment = "production" as const;
  const payloadHash = input.payloadHash ?? hashSmsApiSendPayload(payload);

  if (input.idempotencyKey) {
    const existing = await findIdempotentSmsMessage(
      input.companyId,
      input.apiKeyId,
      environment,
      input.idempotencyKey,
    );
    if (existing) {
      if (existing.payload_hash === payloadHash) {
        return { outcome: "replay", message: rowToSmsApiMessage(existing) };
      }
      return { outcome: "conflict" };
    }
  }

  const country = (input.country ?? "CL").trim().toUpperCase();
  const resolved = await resolveRouteForMessage({
    companyId: input.companyId,
    country,
    phone: input.recipient,
    trafficType: "transactional",
  });

  await assertApiTrafficAllowed({
    companyId: input.companyId,
    routeId: resolved.route.id,
    providerId: resolved.provider.id,
    ratePlanId: resolved.ratePlan.id,
    segmentCost: input.segments,
    trafficType: "transactional",
  });
  assertDlrWebhookSafeForLiveTraffic();

  const effectiveSender =
    (input.sender?.trim() || "") ||
    resolved.provider.default_sender_id ||
    "TELVOICE";

  let pendingMessage: SmsApiMessage;
  try {
    pendingMessage = await createProductionSmsApiMessage({
      ...input,
      environment,
      payloadHash,
      sender: effectiveSender,
      country,
    });
  } catch (error) {
    if (input.idempotencyKey && isUniqueViolation(error)) {
      const existing = await findIdempotentSmsMessage(
        input.companyId,
        input.apiKeyId,
        environment,
        input.idempotencyKey,
      );
      if (existing) {
        if (existing.payload_hash === payloadHash) {
          return { outcome: "replay", message: rowToSmsApiMessage(existing) };
        }
        return { outcome: "conflict" };
      }
    }
    throw error;
  }

  if (await hasSmsDebitForApiMessage(pendingMessage.id)) {
    return { outcome: "replay", message: pendingMessage };
  }

  const providerResult = await dispatchProviderSend(resolved.provider, {
    to: input.recipient,
    message: input.message,
    senderId: effectiveSender,
    metadata: {
      segments: input.segments,
      sms_api_message_id: pendingMessage.id,
      route_id: resolved.route.id,
    },
  });

  if (!providerResult.accepted) {
    await updateSmsApiMessageRow(pendingMessage.id, input.companyId, {
      status: "failed",
      provider_message_id: providerResult.provider_message_id,
      metadata: {
        source: "public_api",
        mode: "production",
        error_code: providerResult.error_code ?? "PROVIDER_REJECTED",
        error_message: providerResult.error_message ?? "Proveedor rechazó el envío",
        raw_response: providerResult.raw_response,
      },
    });
    throw new AppError(
      providerResult.error_message ??
        "El proveedor no aceptó el SMS. No se descontó saldo.",
      502,
    );
  }

  try {
    await debitSmsUsage({
      companyId: input.companyId,
      amount: input.segments,
      referenceType: "sms_api_message",
      referenceId: pendingMessage.id,
      description: "Consumo por envío SMS (API)",
      metadata: {
        mode: "production",
        provider: providerResult.provider,
        api_key_id: input.apiKeyId,
      },
    });
  } catch (err) {
    await updateSmsApiMessageRow(pendingMessage.id, input.companyId, {
      status: "failed",
      metadata: {
        source: "public_api",
        mode: "production",
        error_code: "debit_failed",
        error_message: err instanceof Error ? err.message : "Error al descontar saldo",
      },
    });
    throw err;
  }

  const panelStatus: SmsApiMessageStatus =
    providerResult.status === "pending" ? "pending" : "sent";

  const updated = await updateSmsApiMessageRow(pendingMessage.id, input.companyId, {
    status: panelStatus,
    provider_message_id: providerResult.provider_message_id,
    cost_sms: input.segments,
    metadata: {
      source: "public_api",
      mode: "production",
      provider: resolved.provider.code,
      provider_id: resolved.provider.id,
      route_id: resolved.route.id,
      rate_plan_id: resolved.ratePlan.id,
      asmsc_uid: providerResult.asmsc_uid ?? null,
      raw_response: providerResult.raw_response,
    },
  });

  recordTpsSend({
    companyId: input.companyId,
    providerId: resolved.provider.id,
    routeId: resolved.route.id,
    ratePlanId: resolved.ratePlan.id,
  });

  return { outcome: "created", message: updated };
}

export async function getSmsApiMessageById(
  companyId: string,
  messageId: string,
): Promise<SmsApiMessage | null> {
  const { data, error } = await getSupabase()
    .from("sms_api_messages")
    .select("*")
    .eq("id", messageId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getSmsApiMessageById");
  }

  if (!data) {
    return null;
  }

  return rowToSmsApiMessage(data as SmsApiMessageRow);
}

function parseBeforeCursor(raw: unknown): { ok: true; value: string } | { ok: false; error: SmsApiMessageQueryError } {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, value: "" };
  }
  if (typeof raw !== "string") {
    return {
      ok: false,
      error: {
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "cursor or before must be a valid ISO 8601 timestamp.",
      },
    };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: "" };
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "cursor or before must be a valid ISO 8601 timestamp.",
      },
    };
  }
  return { ok: true, value: new Date(parsed).toISOString() };
}

export function parseSmsApiMessageListQuery(
  query: Record<string, unknown>,
): { ok: true; filters: SmsApiMessageListFilters } | { ok: false; error: SmsApiMessageQueryError } {
  let limit = DEFAULT_LIST_LIMIT;
  if (query.limit !== undefined && query.limit !== null && query.limit !== "") {
    const rawLimit = typeof query.limit === "string" ? query.limit.trim() : String(query.limit);
    if (!/^\d+$/.test(rawLimit)) {
      return {
        ok: false,
        error: {
          statusCode: 400,
          code: "INVALID_LIMIT",
          message: "limit must be a number between 1 and 100.",
        },
      };
    }
    limit = Number.parseInt(rawLimit, 10);
    if (limit < 1 || limit > MAX_LIST_LIMIT) {
      return {
        ok: false,
        error: {
          statusCode: 400,
          code: "INVALID_LIMIT",
          message: "limit must be between 1 and 100.",
        },
      };
    }
  }

  let status: SmsApiMessageStatus | undefined;
  if (query.status !== undefined && query.status !== null && query.status !== "") {
    if (typeof query.status !== "string") {
      return {
        ok: false,
        error: {
          statusCode: 400,
          code: "INVALID_STATUS",
          message: "status filter is invalid.",
        },
      };
    }
    const normalized = query.status.trim();
    if (!SMS_API_MESSAGE_STATUSES.includes(normalized as SmsApiMessageStatus)) {
      return {
        ok: false,
        error: {
          statusCode: 400,
          code: "INVALID_STATUS",
          message: "status filter is invalid.",
        },
      };
    }
    status = normalized as SmsApiMessageStatus;
  }

  let environment: SmsApiMessageEnvironment | undefined;
  if (query.environment !== undefined && query.environment !== null && query.environment !== "") {
    if (typeof query.environment !== "string") {
      return {
        ok: false,
        error: {
          statusCode: 400,
          code: "INVALID_ENVIRONMENT",
          message: "environment must be sandbox or production.",
        },
      };
    }
    const normalized = query.environment.trim().toLowerCase();
    if (normalized !== "sandbox" && normalized !== "production") {
      return {
        ok: false,
        error: {
          statusCode: 400,
          code: "INVALID_ENVIRONMENT",
          message: "environment must be sandbox or production.",
        },
      };
    }
    environment = normalized;
  }

  let externalReference: string | undefined;
  if (
    query.external_reference !== undefined &&
    query.external_reference !== null &&
    query.external_reference !== ""
  ) {
    if (typeof query.external_reference !== "string") {
      return {
        ok: false,
        error: {
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "external_reference must be a string.",
        },
      };
    }
    externalReference = query.external_reference.trim();
  }

  const cursorRaw = query.cursor ?? query.before;
  const beforeParsed = parseBeforeCursor(cursorRaw);
  if (!beforeParsed.ok) {
    return beforeParsed;
  }

  return {
    ok: true,
    filters: {
      status,
      environment,
      externalReference,
      limit,
      before: beforeParsed.value || undefined,
    },
  };
}

export async function listSmsApiMessages(
  companyId: string,
  filters: SmsApiMessageListFilters,
): Promise<SmsApiMessageListResult> {
  let q = getSupabase()
    .from("sms_api_messages")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(filters.limit + 1);

  if (filters.status) {
    q = q.eq("status", filters.status);
  }
  if (filters.environment) {
    q = q.eq("environment", filters.environment);
  }
  if (filters.externalReference) {
    q = q.eq("external_reference", filters.externalReference);
  }
  if (filters.before) {
    q = q.lt("created_at", filters.before);
  }

  const { data, error } = await q;

  if (error) {
    if (isMissingTableError(error)) {
      return { messages: [], nextCursor: null };
    }
    wrapSupabaseError(error, "listSmsApiMessages");
  }

  const rows = (data as SmsApiMessageRow[] | null) ?? [];
  const hasMore = rows.length > filters.limit;
  const pageRows = hasMore ? rows.slice(0, filters.limit) : rows;
  const messages = pageRows.map((row) => rowToSmsApiMessage(row));
  const nextCursor =
    hasMore && pageRows.length > 0
      ? pageRows[pageRows.length - 1]!.created_at
      : null;

  return { messages, nextCursor };
}
