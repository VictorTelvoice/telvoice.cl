import { getSupabase } from "../database/supabaseClient.js";
import type {
  WalletTransactionRow,
  WalletTransactionType,
} from "../types/wallet.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export async function insertWalletTransaction(input: {
  companyId: string;
  walletId: string;
  type: WalletTransactionType | string;
  smsAmount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType?: string | null;
  referenceId?: string | null;
  description?: string | null;
  createdBy?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<WalletTransactionRow> {
  const { data, error } = await getSupabase()
    .from("wallet_transactions")
    .insert({
      company_id: input.companyId,
      wallet_id: input.walletId,
      type: input.type,
      sms_amount: input.smsAmount,
      balance_before: input.balanceBefore,
      balance_after: input.balanceAfter,
      reference_type: input.referenceType ?? null,
      reference_id: input.referenceId ?? null,
      description: input.description ?? null,
      created_by: input.createdBy ?? null,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "insertWalletTransaction");
  }

  return data as WalletTransactionRow;
}

export async function listTransactionsByCompany(
  companyId: string,
  limit = 50,
): Promise<WalletTransactionRow[]> {
  const { data, error } = await getSupabase()
    .from("wallet_transactions")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listTransactionsByCompany");
  }

  return (data ?? []) as WalletTransactionRow[];
}

export async function listTransactionsByWallet(
  walletId: string,
  limit = 50,
): Promise<WalletTransactionRow[]> {
  const { data, error } = await getSupabase()
    .from("wallet_transactions")
    .select("*")
    .eq("wallet_id", walletId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listTransactionsByWallet");
  }

  return (data ?? []) as WalletTransactionRow[];
}

export async function hasPurchaseCreditForOrder(
  orderId: string,
): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("wallet_transactions")
    .select("id")
    .eq("reference_type", "sms_order")
    .eq("reference_id", orderId)
    .eq("type", "purchase_credit")
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return false;
    }
    wrapSupabaseError(error, "hasPurchaseCreditForOrder");
  }

  return Boolean(data);
}

export async function listTransactionsForOrder(
  orderId: string,
): Promise<WalletTransactionRow[]> {
  const { data, error } = await getSupabase()
    .from("wallet_transactions")
    .select("*")
    .eq("reference_type", "sms_order")
    .eq("reference_id", orderId)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listTransactionsForOrder");
  }

  return (data ?? []) as WalletTransactionRow[];
}
