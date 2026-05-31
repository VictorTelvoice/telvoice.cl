import { getSupabase } from "../database/supabaseClient.js";
import type { AdminUserRow } from "../types/admin.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export async function findAdminByEmail(
  email: string,
): Promise<AdminUserRow | null> {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await getSupabase()
    .from("admin_users")
    .select("*")
    .eq("email", normalized)
    .maybeSingle();

  if (error) {
    wrapSupabaseError(error, "findAdminByEmail");
  }

  return data as AdminUserRow | null;
}

export async function findAdminById(id: string): Promise<AdminUserRow | null> {
  const { data, error } = await getSupabase()
    .from("admin_users")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    wrapSupabaseError(error, "findAdminById");
  }

  return data as AdminUserRow | null;
}

export async function createAdminUser(input: {
  email: string;
  password_hash: string;
  name: string;
  role?: string;
}): Promise<AdminUserRow> {
  const { data, error } = await getSupabase()
    .from("admin_users")
    .insert({
      email: input.email.trim().toLowerCase(),
      password_hash: input.password_hash,
      name: input.name.trim(),
      role: input.role ?? "superadmin",
    })
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "createAdminUser");
  }

  return data as AdminUserRow;
}

export async function updateAdminUser(
  id: string,
  patch: { password_hash?: string; role?: string; name?: string },
): Promise<AdminUserRow> {
  const { data, error } = await getSupabase()
    .from("admin_users")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "updateAdminUser");
  }

  return data as AdminUserRow;
}

export async function countAdminUsers(): Promise<number> {
  const { count, error } = await getSupabase()
    .from("admin_users")
    .select("*", { count: "exact", head: true });

  if (error) {
    wrapSupabaseError(error, "countAdminUsers");
  }

  return count ?? 0;
}
