import { AppError } from "../utils/errors.js";
import { env } from "../config/env.js";
import { createClient, type User } from "@supabase/supabase-js";

let authClient:
  | ReturnType<typeof createClient>
  | null = null;

function getAuthClient() {
  if (!authClient) {
    // Server-side: usamos service_role para validar tokens, sin exponerlo.
    authClient = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return authClient;
}

export type VerifiedSupabaseUser = {
  userId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  user: User;
};

export function getBearerTokenFromRequestHeader(
  authHeader: string | undefined,
): string | null {
  const raw = (authHeader ?? "").trim();
  if (!raw) return null;
  const m = /^Bearer\s+(.+)$/i.exec(raw);
  return m?.[1]?.trim() || null;
}

export async function verifySupabaseAccessToken(
  accessToken: string,
): Promise<VerifiedSupabaseUser> {
  if (!accessToken || accessToken.length < 20) {
    throw new AppError("Token inválido.", 401, "SUPABASE_TOKEN_INVALID");
  }
  if (!env.supabase.url || !env.supabase.serviceRoleKey) {
    throw new AppError("Supabase no configurado.", 503, "SUPABASE_NOT_CONFIGURED");
  }

  const { data, error } = await getAuthClient().auth.getUser(accessToken);
  if (error || !data?.user) {
    throw new AppError("Token no válido.", 401, "SUPABASE_TOKEN_UNAUTHORIZED");
  }

  const user = data.user;
  const email = (user.email ?? "").trim().toLowerCase();
  if (!email) {
    throw new AppError("Usuario Supabase sin email.", 401, "SUPABASE_NO_EMAIL");
  }

  const nameRaw =
    (user.user_metadata as any)?.full_name ||
    (user.user_metadata as any)?.name ||
    email;
  const name = String(nameRaw ?? email).trim() || email;
  const avatarUrlRaw =
    (user.user_metadata as any)?.avatar_url ||
    (user.user_metadata as any)?.picture ||
    null;

  return {
    userId: user.id,
    email,
    name,
    avatarUrl: avatarUrlRaw ? String(avatarUrlRaw) : null,
    user,
  };
}

