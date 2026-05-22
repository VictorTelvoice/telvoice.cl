import type { ClientTelegramUserRole } from "../types/database.js";
import { ValidationError } from "./errors.js";

const TELEGRAM_USER_ID_PATTERN = /^\d+$/;
export const TELEGRAM_USER_ROLES: ClientTelegramUserRole[] = [
  "owner",
  "operator",
  "viewer",
];

export interface ParsedTelegramUserForm {
  telegram_user_id: string;
  telegram_chat_id: string | null;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
  role: ClientTelegramUserRole;
  is_active: boolean;
  notes: string | null;
}

function emptyToNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export function parseTelegramUserFormBody(
  body: unknown,
  options?: { requireTelegramUserId?: boolean },
): ParsedTelegramUserForm {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Datos del formulario inválidos.");
  }

  const record = body as Record<string, unknown>;
  const requireId = options?.requireTelegramUserId ?? true;
  const telegram_user_id = String(record.telegram_user_id ?? "").trim();

  if (requireId) {
    if (!telegram_user_id) {
      throw new ValidationError("telegram_user_id es obligatorio.");
    }
    if (!TELEGRAM_USER_ID_PATTERN.test(telegram_user_id)) {
      throw new ValidationError(
        "telegram_user_id debe contener solo dígitos (sin espacios ni signos).",
      );
    }
  }

  const roleRaw = String(record.role ?? "operator").trim().toLowerCase();
  if (!TELEGRAM_USER_ROLES.includes(roleRaw as ClientTelegramUserRole)) {
    throw new ValidationError(
      "role debe ser owner, operator o viewer.",
    );
  }

  const is_active =
    record.is_active === "1" ||
    record.is_active === "on" ||
    record.is_active === true ||
    record.is_active === "true";

  const telegram_chat_id = emptyToNull(record.telegram_chat_id);
  if (telegram_chat_id && !TELEGRAM_USER_ID_PATTERN.test(telegram_chat_id)) {
    throw new ValidationError(
      "telegram_chat_id debe contener solo dígitos si se indica.",
    );
  }

  return {
    telegram_user_id,
    telegram_chat_id,
    telegram_username: emptyToNull(record.telegram_username),
    first_name: emptyToNull(record.first_name),
    last_name: emptyToNull(record.last_name),
    role: roleRaw as ClientTelegramUserRole,
    is_active,
    notes: emptyToNull(record.notes),
  };
}

export function isDuplicateTelegramUserError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? String(error.code) : "";
  const message =
    "message" in error && typeof error.message === "string"
      ? error.message.toLowerCase()
      : "";
  return (
    code === "23505" ||
    message.includes("client_telegram_users_client_telegram_user_unique") ||
    message.includes("duplicate key")
  );
}
