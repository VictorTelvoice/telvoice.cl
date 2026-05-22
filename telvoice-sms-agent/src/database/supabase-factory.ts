import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * URL base del proyecto Supabase (sin /rest/v1).
 * PostgREST y @supabase/supabase-js agregan /rest/v1 internamente.
 */
export function normalizeSupabaseUrl(raw: string): string {
  let url = raw.trim();
  url = url.replace(/\/rest\/v1\/?$/i, "");
  url = url.replace(/\/+$/, "");
  return url;
}

export function maskSecret(value: string, visibleChars = 15): string {
  if (!value || value.length <= visibleChars) {
    return value ? `${value.slice(0, 3)}…` : "(vacío)";
  }
  return `${value.slice(0, visibleChars)}… (${value.length} caracteres, oculto)`;
}

export function createSupabaseClient(
  supabaseUrl: string,
  serviceRoleKey: string,
): SupabaseClient {
  const url = normalizeSupabaseUrl(supabaseUrl);

  if (url !== supabaseUrl.trim().replace(/\/+$/, "")) {
    console.warn(
      `[supabase] SUPABASE_URL normalizada (se quitó /rest/v1): ${url}`,
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getRestV1BaseUrl(supabaseUrl: string): string {
  return `${normalizeSupabaseUrl(supabaseUrl)}/rest/v1`;
}
