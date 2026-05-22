import { getSupabase } from "../database/supabaseClient.js";
import {
  DEFAULT_COUNTRY_CODE,
  type BalanceLedgerRow,
  type BalanceRow,
} from "../types/database.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export async function ensureBalanceForClient(
  clientId: string,
  countryCode: string = DEFAULT_COUNTRY_CODE,
): Promise<BalanceRow> {
  const existing = await getBalanceByClientId(clientId, countryCode);
  if (existing) {
    return existing;
  }

  const { data, error } = await getSupabase()
    .from("balances")
    .insert({
      client_id: clientId,
      country_code: countryCode,
      available_units: 0,
      reserved_units: 0,
      consumed_units: 0,
    })
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "ensureBalanceForClient");
  }

  return data as BalanceRow;
}

export async function getBalanceByClientId(
  clientId: string,
  countryCode: string = DEFAULT_COUNTRY_CODE,
): Promise<BalanceRow | null> {
  const { data, error } = await getSupabase()
    .from("balances")
    .select("*")
    .eq("client_id", clientId)
    .eq("country_code", countryCode)
    .maybeSingle();

  if (error) {
    wrapSupabaseError(error, "getBalanceByClientId");
  }

  return data as BalanceRow | null;
}

export async function creditManualBalance(input: {
  clientId: string;
  countryCode: string;
  units: number;
  description: string;
}): Promise<BalanceRow> {
  if (!Number.isInteger(input.units) || input.units <= 0) {
    throw new Error("units debe ser un entero positivo.");
  }

  const balance = await ensureBalanceForClient(input.clientId, input.countryCode);
  const newAvailable = balance.available_units + input.units;

  const { data, error } = await getSupabase()
    .from("balances")
    .update({ available_units: newAvailable })
    .eq("id", balance.id)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "creditManualBalance");
  }

  const { error: ledgerError } = await getSupabase().from("balance_ledger").insert({
    client_id: input.clientId,
    country_code: input.countryCode,
    movement_type: "manual_adjustment",
    units: input.units,
    description: input.description,
    reference_type: "manual_credit",
  });

  if (ledgerError) {
    wrapSupabaseError(ledgerError, "creditManualBalance.ledger");
  }

  return data as BalanceRow;
}

export async function listBalanceLedgerForClient(
  clientId: string,
  limit = 100,
): Promise<BalanceLedgerRow[]> {
  const { data, error } = await getSupabase()
    .from("balance_ledger")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    wrapSupabaseError(error, "listBalanceLedgerForClient");
  }

  return (data ?? []) as BalanceLedgerRow[];
}
