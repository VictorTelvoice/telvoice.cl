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
  filterClientAccountOrders,
  isQaTransaction,
} from "../utils/order-display.js";
import {
  APP_SCHEDULE_TIMEZONE,
  dayStartIsoInTimeZone,
  monthStartIsoInTimeZone,
} from "../utils/scheduleTime.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export type ClientDashboardStats = {
  smsSentMonth: number;
  smsCostMonth: number;
  campaignsMonth: number;
  globalDeliveryRate: string;
  todayDlrRate: string;
  todayDlrDetail: string;
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

type MessageStatRow = {
  status: string;
  mode: string | null;
  created_at: string;
  cost_sms: number | null;
};

function deliveryRatePercent(delivered: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((delivered / total) * 100)}%`;
}

function countDeliveryStats(rows: MessageStatRow[]): {
  delivered: number;
  total: number;
} {
  const countable = rows.filter(
    (m) => m.mode !== "mock" && m.status !== "queued",
  );
  const delivered = countable.filter((m) => m.status === "delivered").length;
  return { delivered, total: countable.length };
}

async function loadDashboardMonthStats(
  companyId: string,
): Promise<ClientDashboardStats> {
  const empty: ClientDashboardStats = {
    smsSentMonth: 0,
    smsCostMonth: 0,
    campaignsMonth: 0,
    globalDeliveryRate: "—",
    todayDlrRate: "—",
    todayDlrDetail: "Sin envíos hoy",
  };
  const monthStart = monthStartIsoInTimeZone(new Date(), APP_SCHEDULE_TIMEZONE);
  const dayStart = dayStartIsoInTimeZone(new Date(), APP_SCHEDULE_TIMEZONE);

  const [{ data: monthMessages, error: msgError }, { data: globalMessages, error: globalError }] =
    await Promise.all([
      getSupabase()
        .from("panel_sms_messages")
        .select("status, mode, created_at, cost_sms")
        .eq("company_id", companyId)
        .gte("created_at", monthStart),
      getSupabase()
        .from("panel_sms_messages")
        .select("status, mode")
        .eq("company_id", companyId)
        .neq("mode", "mock")
        .limit(5000),
    ]);

  if (msgError) {
    if (isMissingTableError(msgError)) {
      return empty;
    }
    wrapSupabaseError(msgError, "loadDashboardMonthStats.messages");
  }
  if (globalError && !isMissingTableError(globalError)) {
    wrapSupabaseError(globalError, "loadDashboardMonthStats.global");
  }

  const monthRows = (monthMessages ?? []) as MessageStatRow[];
  const smsCostMonth = monthRows.reduce(
    (sum, row) => sum + (Number(row.cost_sms) || 0),
    0,
  );

  const globalStats = countDeliveryStats(
    (globalMessages ?? []) as MessageStatRow[],
  );
  const todayRows = monthRows.filter((m) => m.created_at >= dayStart);
  const todayStats = countDeliveryStats(todayRows);

  const { count: campaignsMonth, error: campError } = await getSupabase()
    .from("sms_campaigns")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .gte("created_at", monthStart);

  if (campError && !isMissingTableError(campError)) {
    wrapSupabaseError(campError, "loadDashboardMonthStats.campaigns");
  }

  return {
    smsSentMonth: monthRows.length,
    smsCostMonth,
    campaignsMonth: campaignsMonth ?? 0,
    globalDeliveryRate: deliveryRatePercent(
      globalStats.delivered,
      globalStats.total,
    ),
    todayDlrRate: deliveryRatePercent(todayStats.delivered, todayStats.total),
    todayDlrDetail:
      todayStats.total > 0
        ? `${todayStats.delivered} de ${todayStats.total} confirmados por DLR`
        : "Sin envíos hoy",
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

  const visibleOrders = filterClientAccountOrders(orders);
  const visibleTransactions = transactions.filter((t) => !isQaTransaction(t));

  const pendingOrdersCount = visibleOrders.filter(
    (o) =>
      o.payment_status === "pending" ||
      (o.payment_status === "paid" && o.credit_status === "pending"),
  ).length;

  const credited = visibleOrders.filter((o) => o.credit_status === "credited");
  const lastPurchaseAt = credited[0]?.credited_at ?? credited[0]?.created_at ?? null;

  return {
    company,
    balance,
    stats,
    recentOrders: visibleOrders.slice(0, 5),
    recentTransactions: visibleTransactions.slice(0, 5),
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
