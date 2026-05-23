import { getSupabase } from "../database/supabaseClient.js";
import type { WalletGlobalStats } from "../types/wallet.js";
import { isMissingTableError } from "../utils/db-table.js";

const LOW_BALANCE_THRESHOLD = 500;

export async function getWalletGlobalStats(): Promise<WalletGlobalStats | null> {
  try {
    const { data: wallets, error: wErr } = await getSupabase()
      .from("company_sms_wallets")
      .select("available_sms, consumed_sms, total_purchased_sms, status");

    if (wErr) {
      if (isMissingTableError(wErr)) {
        return null;
      }
      throw wErr;
    }

    const rows = wallets ?? [];
    let totalPurchasedSms = 0;
    let totalConsumedSms = 0;
    let totalAvailableSms = 0;
    let activeWallets = 0;
    let lowBalanceCompanies = 0;

    for (const r of rows as {
      available_sms: number;
      consumed_sms: number;
      total_purchased_sms: number;
      status: string;
    }[]) {
      totalPurchasedSms += r.total_purchased_sms ?? 0;
      totalConsumedSms += r.consumed_sms ?? 0;
      totalAvailableSms += r.available_sms ?? 0;
      if (r.status === "active") {
        activeWallets += 1;
      }
      if ((r.available_sms ?? 0) < LOW_BALANCE_THRESHOLD) {
        lowBalanceCompanies += 1;
      }
    }

    const { count: pendingOrders, error: pErr } = await getSupabase()
      .from("sms_orders")
      .select("*", { count: "exact", head: true })
      .eq("payment_status", "pending");

    const { count: paidPendingCredit, error: cErr } = await getSupabase()
      .from("sms_orders")
      .select("*", { count: "exact", head: true })
      .eq("payment_status", "paid")
      .eq("credit_status", "pending");

    if (pErr && !isMissingTableError(pErr)) {
      throw pErr;
    }
    if (cErr && !isMissingTableError(cErr)) {
      throw cErr;
    }

    return {
      totalPurchasedSms,
      totalConsumedSms,
      totalAvailableSms,
      pendingOrders: pendingOrders ?? 0,
      paidPendingCredit: paidPendingCredit ?? 0,
      activeWallets,
      lowBalanceCompanies,
    };
  } catch {
    return null;
  }
}
