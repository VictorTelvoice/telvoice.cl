import { getSupabase } from "../database/supabaseClient.js";
import { getOrCreateCompanyWallet } from "./smsWalletService.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

async function companyWalletActivityScore(companyId: string): Promise<number> {
  const wallet = await getOrCreateCompanyWallet(companyId, "CL");
  return (
    Number(wallet.available_sms ?? 0) +
    Number(wallet.total_purchased_sms ?? 0) +
    Number(wallet.consumed_sms ?? 0)
  );
}

/** Tras acreditar compra, vincula perfiles con el mismo email que aún apuntan a empresa vacía. */
export async function relinkEmptyProfilesToPurchasedCompany(
  email: string,
  companyId: string,
): Promise<number> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !companyId) return 0;

  const { data: profiles, error } = await getSupabase()
    .from("user_profiles")
    .select("id, company_id")
    .ilike("email", normalized);
  if (error) {
    wrapSupabaseError(error, "relinkProfiles.select");
  }

  let relinked = 0;
  for (const profile of profiles ?? []) {
    const currentCompanyId = profile.company_id ? String(profile.company_id) : "";
    if (!currentCompanyId || currentCompanyId === companyId) continue;

    const currentScore = await companyWalletActivityScore(currentCompanyId);
    if (currentScore > 0) continue;

    const { error: upErr } = await getSupabase()
      .from("user_profiles")
      .update({ company_id: companyId })
      .eq("id", profile.id);
    if (upErr) {
      wrapSupabaseError(upErr, "relinkProfiles.update");
    }
    relinked += 1;
    console.info(
      "[post-pay] relink profile to purchased company",
      normalized,
      { from: currentCompanyId, to: companyId },
    );
  }

  return relinked;
}
