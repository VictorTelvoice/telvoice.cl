import { findCompanyById } from "./companyService.js";
import { listSmsOrdersByCompany } from "./smsOrderService.js";
import { listCustomerVisiblePackages } from "./smsPackageService.js";
import { getCompanyBalance } from "./smsWalletService.js";
import { listTransactionsByCompany } from "./walletTransactionService.js";
import { getSupabase } from "../database/supabaseClient.js";
import type { CompanyRow } from "../types/tenant.js";
import type {
  CompanyBalanceView,
  SmsOrderWithDetails,
  SmsPackageRow,
  WalletTransactionRow,
} from "../types/wallet.js";
import { isMissingTableError } from "../utils/db-table.js";
import {
  APP_SCHEDULE_TIMEZONE,
  monthStartIsoInTimeZone,
} from "../utils/scheduleTime.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export type ClientDashboardStats = {
  smsSentMonth: number;
  smsCostMonth: number;
  campaignsMonth: number;
};

export type ClientDashboardData = {
  company: CompanyRow;
  balance: CompanyBalanceView;
  stats: ClientDashboardStats;
  recentOrders: SmsOrderWithDetails[];
  recentTransactions: WalletTransactionRow[];
  pendingOrdersCount: number;
  packagesAvailable: number;
  lastPurchaseAt: string | null;
};

async function loadDashboardMonthStats(
  companyId: string,
): Promise<ClientDashboardStats> {
  const empty: ClientDashboardStats = {
    smsSentMonth: 0,
    smsCostMonth: 0,
    campaignsMonth: 0,
  };
  const monthStart = monthStartIsoInTimeZone(new Date(), APP_SCHEDULE_TIMEZONE);

  const { data: messages, error: msgError } = await getSupabase()
    .from("panel_sms_messages")
    .select("cost_sms")
    .eq("company_id", companyId)
    .gte("created_at", monthStart);

  if (msgError) {
    if (isMissingTableError(msgError)) {
      return empty;
    }
    wrapSupabaseError(msgError, "loadDashboardMonthStats.messages");
  }

  const rows = messages ?? [];
  const smsCostMonth = rows.reduce(
    (sum, row) => sum + (Number(row.cost_sms) || 0),
    0,
  );

  const { count: campaignsMonth, error: campError } = await getSupabase()
    .from("sms_campaigns")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .gte("created_at", monthStart);

  if (campError && !isMissingTableError(campError)) {
    wrapSupabaseError(campError, "loadDashboardMonthStats.campaigns");
  }

  return {
    smsSentMonth: rows.length,
    smsCostMonth,
    campaignsMonth: campaignsMonth ?? 0,
  };
}

export async function getClientDashboardData(
  companyId: string,
  country = "CL",
  preloaded?: Pick<ClientDashboardData, "company" | "balance">,
): Promise<ClientDashboardData> {
  const [orders, transactions, packages, stats] = await Promise.all([
    listSmsOrdersByCompany(companyId, 20),
    listTransactionsByCompany(companyId, 10),
    listCustomerVisiblePackages(country),
    loadDashboardMonthStats(companyId),
  ]);

  const company = preloaded?.company ?? (await findCompanyById(companyId));
  const balance =
    preloaded?.balance ?? (await getCompanyBalance(companyId, country));

  if (!company) {
    throw new Error("Empresa no encontrada");
  }

  const pendingOrdersCount = orders.filter(
    (o) =>
      o.payment_status === "pending" ||
      (o.payment_status === "paid" && o.credit_status === "pending"),
  ).length;

  const credited = orders.filter((o) => o.credit_status === "credited");
  const lastPurchaseAt = credited[0]?.credited_at ?? credited[0]?.created_at ?? null;

  return {
    company,
    balance,
    stats,
    recentOrders: orders.slice(0, 5),
    recentTransactions: transactions.slice(0, 5),
    pendingOrdersCount,
    packagesAvailable: packages.length,
    lastPurchaseAt,
  };
}

export async function getClientCatalogPackages(
  country = "CL",
): Promise<SmsPackageRow[]> {
  return listCustomerVisiblePackages(country);
}
