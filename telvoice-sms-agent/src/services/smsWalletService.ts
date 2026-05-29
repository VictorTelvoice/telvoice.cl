import { getSupabase } from "../database/supabaseClient.js";
import { insertAuditLog } from "./auditLogService.js";
import { listCompanies } from "./companyService.js";
import { insertWalletTransaction } from "./walletTransactionService.js";
import type {
  CompanyBalanceView,
  CompanySmsWalletRow,
  WalletListRow,
  WalletStatus,
} from "../types/wallet.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

const DEFAULT_COUNTRY = "CL";

function assertPositiveInteger(amount: number, label: string): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new AppError(`${label} debe ser un entero positivo.`, 400);
  }
}

function assertWalletCanTransact(wallet: CompanySmsWalletRow): void {
  if (wallet.status === "frozen" || wallet.status === "suspended") {
    throw new AppError(
      `Wallet en estado ${wallet.status}; no permite movimientos.`,
      400,
    );
  }
}

export async function getOrCreateCompanyWallet(
  companyId: string,
  country: string = DEFAULT_COUNTRY,
): Promise<CompanySmsWalletRow> {
  const { data: existing, error: findError } = await getSupabase()
    .from("company_sms_wallets")
    .select("*")
    .eq("company_id", companyId)
    .eq("country", country)
    .maybeSingle();

  if (findError) {
    if (isMissingTableError(findError)) {
      throw new AppError(
        "Tablas de wallet no disponibles. Aplica la migración 011.",
        503,
      );
    }
    wrapSupabaseError(findError, "getOrCreateCompanyWallet");
  }

  if (existing) {
    return existing as CompanySmsWalletRow;
  }

  const { data, error } = await getSupabase()
    .from("company_sms_wallets")
    .insert({
      company_id: companyId,
      country,
      available_sms: 0,
      reserved_sms: 0,
      consumed_sms: 0,
      total_purchased_sms: 0,
      status: "active",
    })
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "getOrCreateCompanyWallet.insert");
  }

  return data as CompanySmsWalletRow;
}

export function walletToBalanceView(wallet: CompanySmsWalletRow): CompanyBalanceView {
  return {
    companyId: wallet.company_id,
    country: wallet.country,
    availableSms: wallet.available_sms,
    reservedSms: wallet.reserved_sms,
    consumedSms: wallet.consumed_sms,
    totalPurchasedSms: wallet.total_purchased_sms,
    status: wallet.status as WalletStatus,
    walletId: wallet.id,
  };
}

export async function getCompanyBalance(
  companyId: string,
  country: string = DEFAULT_COUNTRY,
): Promise<CompanyBalanceView> {
  const wallet = await getOrCreateCompanyWallet(companyId, country);
  return walletToBalanceView(wallet);
}

/** Lectura sin crear wallet — devuelve saldo 0 si no existe fila. */
export async function readCompanyBalance(
  companyId: string,
  country: string = DEFAULT_COUNTRY,
): Promise<CompanyBalanceView> {
  const { data, error } = await getSupabase()
    .from("company_sms_wallets")
    .select("*")
    .eq("company_id", companyId)
    .eq("country", country)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      throw new AppError(
        "Tablas de wallet no disponibles. Aplica la migración 011.",
        503,
      );
    }
    wrapSupabaseError(error, "readCompanyBalance");
  }

  if (!data) {
    return {
      companyId,
      country,
      availableSms: 0,
      reservedSms: 0,
      consumedSms: 0,
      totalPurchasedSms: 0,
      status: "active",
      walletId: null,
    };
  }

  return walletToBalanceView(data as CompanySmsWalletRow);
}

async function persistWallet(
  walletId: string,
  patch: Partial<CompanySmsWalletRow>,
): Promise<CompanySmsWalletRow> {
  const { data, error } = await getSupabase()
    .from("company_sms_wallets")
    .update(patch)
    .eq("id", walletId)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "persistWallet");
  }

  return data as CompanySmsWalletRow;
}

export async function listWalletsForAdmin(): Promise<WalletListRow[]> {
  const companies = await listCompanies(200);
  if (companies.length === 0) {
    return [];
  }

  const { data: wallets, error } = await getSupabase()
    .from("company_sms_wallets")
    .select("*");

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listWalletsForAdmin");
  }

  const walletByKey = new Map<string, CompanySmsWalletRow>();
  for (const w of (wallets ?? []) as CompanySmsWalletRow[]) {
    walletByKey.set(`${w.company_id}:${w.country}`, w);
  }

  return companies.map((c) => {
    const w = walletByKey.get(`${c.id}:${DEFAULT_COUNTRY}`);
    if (w) {
      return {
        ...walletToBalanceView(w),
        companyName: c.name,
        lastTransactionAt: null,
      };
    }
    return {
      companyId: c.id,
      country: DEFAULT_COUNTRY,
      availableSms: 0,
      reservedSms: 0,
      consumedSms: 0,
      totalPurchasedSms: 0,
      status: "active" as WalletStatus,
      walletId: null,
      companyName: c.name,
      lastTransactionAt: null,
    };
  });
}

export async function manualCreditWallet(input: {
  companyId: string;
  smsAmount: number;
  description: string;
  actorUserId?: string | null;
  country?: string;
}): Promise<CompanySmsWalletRow> {
  assertPositiveInteger(input.smsAmount, "smsAmount");
  const wallet = await getOrCreateCompanyWallet(
    input.companyId,
    input.country ?? DEFAULT_COUNTRY,
  );
  assertWalletCanTransact(wallet);

  const before = wallet.available_sms;
  const after = before + input.smsAmount;

  const updated = await persistWallet(wallet.id, {
    available_sms: after,
  } as Partial<CompanySmsWalletRow>);

  await insertWalletTransaction({
    companyId: input.companyId,
    walletId: wallet.id,
    type: "manual_credit",
    smsAmount: input.smsAmount,
    balanceBefore: before,
    balanceAfter: after,
    description: input.description,
    createdBy: input.actorUserId ?? null,
  });

  await insertAuditLog({
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    action: "wallet.credit",
    entityType: "company_sms_wallet",
    entityId: wallet.id,
    metadata: { smsAmount: input.smsAmount, description: input.description },
  });

  return updated;
}

export async function manualDebitWallet(input: {
  companyId: string;
  smsAmount: number;
  description: string;
  actorUserId?: string | null;
  country?: string;
}): Promise<CompanySmsWalletRow> {
  assertPositiveInteger(input.smsAmount, "smsAmount");
  const wallet = await getOrCreateCompanyWallet(
    input.companyId,
    input.country ?? DEFAULT_COUNTRY,
  );
  assertWalletCanTransact(wallet);

  if (wallet.available_sms < input.smsAmount) {
    throw new AppError("Saldo disponible insuficiente.", 400);
  }

  const before = wallet.available_sms;
  const after = before - input.smsAmount;

  const updated = await persistWallet(wallet.id, {
    available_sms: after,
  } as Partial<CompanySmsWalletRow>);

  await insertWalletTransaction({
    companyId: input.companyId,
    walletId: wallet.id,
    type: "manual_debit",
    smsAmount: input.smsAmount,
    balanceBefore: before,
    balanceAfter: after,
    description: input.description,
    createdBy: input.actorUserId ?? null,
  });

  await insertAuditLog({
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    action: "wallet.debit",
    entityType: "company_sms_wallet",
    entityId: wallet.id,
    metadata: { smsAmount: input.smsAmount, description: input.description },
  });

  return updated;
}

export async function reserveSms(input: {
  companyId: string;
  amount: number;
  referenceType?: string;
  referenceId?: string;
  actorUserId?: string | null;
  country?: string;
}): Promise<CompanySmsWalletRow> {
  assertPositiveInteger(input.amount, "amount");
  const wallet = await getOrCreateCompanyWallet(
    input.companyId,
    input.country ?? DEFAULT_COUNTRY,
  );
  assertWalletCanTransact(wallet);

  if (wallet.available_sms < input.amount) {
    throw new AppError("Saldo disponible insuficiente para reservar.", 400);
  }

  const before = wallet.available_sms;
  const after = before - input.amount;

  const updated = await persistWallet(wallet.id, {
    available_sms: after,
    reserved_sms: wallet.reserved_sms + input.amount,
  } as Partial<CompanySmsWalletRow>);

  await insertWalletTransaction({
    companyId: input.companyId,
    walletId: wallet.id,
    type: "reserve",
    smsAmount: input.amount,
    balanceBefore: before,
    balanceAfter: after,
    referenceType: input.referenceType ?? null,
    referenceId: input.referenceId ?? null,
    createdBy: input.actorUserId ?? null,
  });

  return updated;
}

export async function releaseReservedSms(input: {
  companyId: string;
  amount: number;
  referenceType?: string;
  referenceId?: string;
  actorUserId?: string | null;
  country?: string;
}): Promise<CompanySmsWalletRow> {
  assertPositiveInteger(input.amount, "amount");
  const wallet = await getOrCreateCompanyWallet(
    input.companyId,
    input.country ?? DEFAULT_COUNTRY,
  );

  if (wallet.reserved_sms < input.amount) {
    throw new AppError("Reserva insuficiente para liberar.", 400);
  }

  const before = wallet.available_sms;
  const after = before + input.amount;

  const updated = await persistWallet(wallet.id, {
    available_sms: after,
    reserved_sms: wallet.reserved_sms - input.amount,
  } as Partial<CompanySmsWalletRow>);

  await insertWalletTransaction({
    companyId: input.companyId,
    walletId: wallet.id,
    type: "release_reserved",
    smsAmount: input.amount,
    balanceBefore: before,
    balanceAfter: after,
    referenceType: input.referenceType ?? null,
    referenceId: input.referenceId ?? null,
    createdBy: input.actorUserId ?? null,
  });

  return updated;
}

export async function debitSmsUsage(input: {
  companyId: string;
  amount: number;
  referenceType?: string;
  referenceId?: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
  actorUserId?: string | null;
  country?: string;
}): Promise<CompanySmsWalletRow> {
  assertPositiveInteger(input.amount, "amount");
  const wallet = await getOrCreateCompanyWallet(
    input.companyId,
    input.country ?? DEFAULT_COUNTRY,
  );
  assertWalletCanTransact(wallet);

  if (wallet.available_sms < input.amount) {
    throw new AppError("Saldo disponible insuficiente para débito por envío.", 400);
  }

  const before = wallet.available_sms;
  const after = before - input.amount;

  const updated = await persistWallet(wallet.id, {
    available_sms: after,
    consumed_sms: wallet.consumed_sms + input.amount,
  } as Partial<CompanySmsWalletRow>);

  await insertWalletTransaction({
    companyId: input.companyId,
    walletId: wallet.id,
    type: "sms_debit",
    smsAmount: input.amount,
    balanceBefore: before,
    balanceAfter: after,
    referenceType: input.referenceType ?? null,
    referenceId: input.referenceId ?? null,
    description: input.description ?? "Consumo por envío SMS",
    createdBy: input.actorUserId ?? null,
    metadata: input.metadata ?? {},
  });

  return updated;
}

/** Acredita saldo por compra (usado desde smsOrderService). */
export async function applyPurchaseCredit(input: {
  companyId: string;
  smsAmount: number;
  orderId: string;
  actorUserId?: string | null;
  country?: string;
}): Promise<CompanySmsWalletRow> {
  assertPositiveInteger(input.smsAmount, "smsAmount");
  const wallet = await getOrCreateCompanyWallet(
    input.companyId,
    input.country ?? DEFAULT_COUNTRY,
  );
  assertWalletCanTransact(wallet);

  const before = wallet.available_sms;
  const after = before + input.smsAmount;

  const updated = await persistWallet(wallet.id, {
    available_sms: after,
    total_purchased_sms: wallet.total_purchased_sms + input.smsAmount,
  } as Partial<CompanySmsWalletRow>);

  await insertWalletTransaction({
    companyId: input.companyId,
    walletId: wallet.id,
    type: "purchase_credit",
    smsAmount: input.smsAmount,
    balanceBefore: before,
    balanceAfter: after,
    referenceType: "sms_order",
    referenceId: input.orderId,
    description: "Acreditación por compra de bolsa SMS",
    createdBy: input.actorUserId ?? null,
  });

  return updated;
}
