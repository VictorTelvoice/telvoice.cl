import { getSupabase } from "../database/supabaseClient.js";
import { calculateSimpleApiSmsSegments } from "../utils/sms-api-segments.js";
import { hashSmsApiSendPayload } from "../utils/sms-api-payload-hash.js";
import type {
  CreateSandboxSmsApiMessageInput,
  SandboxSmsSendResolution,
  SmsApiMessage,
  SmsApiMessageEnvironment,
  SmsApiMessageRow,
  SmsApiMessageStatus,
  SmsApiMessagesModuleState,
  SmsApiSendPayload,
  SmsApiSendValidationError,
} from "../types/sms-api-messages.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

const MAX_MESSAGE_LENGTH = 918;
const MAX_SENDER_LENGTH = 11;
const MAX_EXTERNAL_REFERENCE_LENGTH = 120;
const MAX_IDEMPOTENCY_KEY_LENGTH = 120;

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
