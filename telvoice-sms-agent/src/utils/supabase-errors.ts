import type { PostgrestError } from "@supabase/supabase-js";
import { DatabaseError } from "./errors.js";

export function isPgrestSchemaCacheError(
  error: PostgrestError | { code?: string; message?: string } | null,
): boolean {
  if (!error) {
    return false;
  }
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  return (
    code === "PGRST205" ||
    message.includes("schema cache") ||
    message.includes("could not find the table")
  );
}

export function formatSupabaseError(
  error: PostgrestError | { code?: string; message?: string; details?: string; hint?: string },
): string {
  const parts = [
    error.code ? `code=${error.code}` : null,
    error.message ? `message=${error.message}` : null,
    "details" in error && error.details ? `details=${error.details}` : null,
    "hint" in error && error.hint ? `hint=${error.hint}` : null,
  ].filter(Boolean);
  return parts.join(" | ");
}

export function isDuplicateKeyError(
  error: unknown,
): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: string }).message)
        : String(error ?? "");
  return (
    message.includes("duplicate key") ||
    message.includes("idx_wallet_transactions_order_purchase_unique")
  );
}

export function wrapSupabaseError(
  error: PostgrestError | null,
  context: string,
): never {
  const message = error?.message ?? "Error desconocido de base de datos.";
  throw new DatabaseError(`${context}: ${message}`, {
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
  });
}
