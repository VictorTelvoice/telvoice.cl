import { isProduction } from "../config/env.js";
import { getSupabase } from "../database/supabaseClient.js";
import type { AdminSessionUser } from "../types/admin.js";
import {
  canAccessAdminPanel,
  normalizeRole,
  ROLES,
} from "../types/roles.js";
import type { UserProfileContext, UserProfileRow } from "../types/tenant.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = (error as { code?: string }).code;
  const message = String((error as { message?: string }).message ?? "");
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("user_profiles") ||
    message.includes("does not exist")
  );
}

function rowToContext(row: UserProfileRow): UserProfileContext {
  const role = normalizeRole(row.role);
  return {
    profileId: row.id,
    adminUserId: row.admin_user_id,
    authUserId: row.user_id,
    companyId: row.company_id,
    email: row.email,
    fullName: row.full_name,
    role,
    status: row.status,
    isInternal: canAccessAdminPanel(role),
    fromDatabase: true,
  };
}

function fallbackFromAdmin(admin: AdminSessionUser): UserProfileContext {
  const role = normalizeRole(admin.role);
  return {
    profileId: null,
    adminUserId: admin.id,
    authUserId: null,
    companyId: admin.companyId ?? null,
    email: admin.email,
    fullName: admin.name,
    role,
    status: "active",
    isInternal: canAccessAdminPanel(role),
    fromDatabase: false,
  };
}

export async function findProfileByAdminUserId(
  adminUserId: string,
): Promise<UserProfileRow | null> {
  const { data, error } = await getSupabase()
    .from("user_profiles")
    .select("*")
    .eq("admin_user_id", adminUserId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "findProfileByAdminUserId");
  }

  return data as UserProfileRow | null;
}

export async function getCurrentUserProfile(
  admin: AdminSessionUser | undefined,
): Promise<UserProfileContext | null> {
  if (!admin) {
    return null;
  }

  try {
    const row = await findProfileByAdminUserId(admin.id);
    if (row) {
      if (row.status !== "active") {
        return null;
      }
      return rowToContext(row);
    }
  } catch {
    if (isProduction()) {
      return null;
    }
  }

  const fallback = fallbackFromAdmin(admin);

  if (isProduction() && !fallback.isInternal) {
    return null;
  }

  if (
    isProduction() &&
    fallback.isInternal &&
    !canAccessAdminPanel(fallback.role)
  ) {
    return null;
  }

  return fallback;
}

/** Crea perfil interno al registrar admin (si la tabla existe). */
export async function ensureInternalProfileForAdmin(
  admin: AdminSessionUser,
): Promise<void> {
  try {
    const existing = await findProfileByAdminUserId(admin.id);
    if (existing) {
      return;
    }

    const role = normalizeRole(admin.role);
    const internalRole =
      role === ROLES.SUPERADMIN ? ROLES.SUPERADMIN : role;

    const { error } = await getSupabase().from("user_profiles").insert({
      admin_user_id: admin.id,
      full_name: admin.name,
      email: admin.email.toLowerCase(),
      role: internalRole,
      status: "active",
      company_id: null,
    });

    if (error && !isMissingTableError(error)) {
      wrapSupabaseError(error, "ensureInternalProfileForAdmin");
    }
  } catch {
    /* Tabla aún no migrada — no bloquear login */
  }
}
