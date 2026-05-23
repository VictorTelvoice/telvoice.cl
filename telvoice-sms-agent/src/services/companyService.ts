import { getSupabase } from "../database/supabaseClient.js";
import type { CompanyRow } from "../types/tenant.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = (error as { code?: string }).code;
  return code === "42P01" || code === "PGRST205";
}

export async function findCompanyById(id: string): Promise<CompanyRow | null> {
  const { data, error } = await getSupabase()
    .from("companies")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "findCompanyById");
  }

  return data as CompanyRow | null;
}

export async function listCompanies(limit = 50): Promise<CompanyRow[]> {
  const { data, error } = await getSupabase()
    .from("companies")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listCompanies");
  }

  return (data ?? []) as CompanyRow[];
}
