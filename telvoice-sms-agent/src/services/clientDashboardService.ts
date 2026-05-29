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
  buildScheduledIsoInTimeZone,
  dayStartIsoInTimeZone,
  monthStartIsoInTimeZone,
} from "../utils/scheduleTime.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export type ClientDashboardStats = {
  /** SMS consumidos hoy (suma cost_sms; multiparte cuenta varios). */
  smsTodayTotal: number;
  /** Destinatarios con envío contabilizable hoy (1 fila = 1 número). */
  smsTodayDestinations: number;
  smsSentMonth: number;
  smsCostMonth: number;
  campaignsMonth: number;
  globalDeliveryRate: string;
  todayDlrRate: string;
  todayDlrDetail: string;
};

/** Reparto DLR del mes (excluye mock y cola). */
export type ClientDashboardDlrBreakdown = {
  sent: number;
  delivered: number;
  failed: number;
};

export type ClientDashboardDayVolume = {
  label: string;
  count: number;
};

export type ClientDashboardCharts = {
  dlrBreakdown: ClientDashboardDlrBreakdown;
  last7Days: ClientDashboardDayVolume[];
  todayDestinations: number;
  todaySmsUnits: number;
};

export type ClientDashboardData = {
  company: CompanyRow;
  balance: CompanyBalanceView;
  stats: ClientDashboardStats;
  charts: ClientDashboardCharts;
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

function smsUnitsForRow(row: MessageStatRow): number {
  const units = Number(row.cost_sms);
  return Number.isFinite(units) && units > 0 ? units : 1;
}

function countDeliveryStats(rows: MessageStatRow[]): {
  delivered: number;
  total: number;
} {
  const countable = rows.filter(isCountableMessage);
  const delivered = countable
    .filter((m) => m.status === "delivered")
    .reduce((sum, m) => sum + smsUnitsForRow(m), 0);
  const total = smsUnitsFromRows(rows);
  return { delivered, total };
}

const FAILED_STATUSES = new Set(["failed", "rejected", "expired"]);

function isCountableMessage(row: MessageStatRow): boolean {
  return row.mode !== "mock" && row.status !== "queued";
}

function isTodayInChile(iso: string, todayKey: string): boolean {
  return dateKeyInTimeZone(iso, APP_SCHEDULE_TIMEZONE) === todayKey;
}

function smsUnitsFromRows(rows: MessageStatRow[]): number {
  return rows
    .filter(isCountableMessage)
    .reduce((sum, row) => sum + smsUnitsForRow(row), 0);
}

function destinationCountFromRows(rows: MessageStatRow[]): number {
  return rows.filter(isCountableMessage).length;
}

function breakdownFromMessages(rows: MessageStatRow[]): ClientDashboardDlrBreakdown {
  const breakdown: ClientDashboardDlrBreakdown = {
    sent: 0,
    delivered: 0,
    failed: 0,
  };
  for (const row of rows) {
    if (!isCountableMessage(row)) {
      continue;
    }
    if (row.status === "delivered") {
      breakdown.delivered += smsUnitsForRow(row);
    } else if (FAILED_STATUSES.has(row.status)) {
      breakdown.failed += smsUnitsForRow(row);
    } else {
      breakdown.sent += smsUnitsForRow(row);
    }
  }
  return breakdown;
}

function dateKeyInTimeZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

type DayVolumeBucket = ClientDashboardDayVolume & { key: string };

function last7DaysVolumeTemplate(timeZone: string): DayVolumeBucket[] {
  const days: DayVolumeBucket[] = [];
  const now = Date.now();
  for (let offset = 6; offset >= 0; offset -= 1) {
    const d = new Date(now - offset * 86_400_000);
    const key = dateKeyInTimeZone(d.toISOString(), timeZone);
    const label = new Intl.DateTimeFormat("es-CL", {
      timeZone,
      weekday: "short",
      day: "numeric",
    }).format(d);
    days.push({ key, label, count: 0 });
  }
  return days;
}

function countByDayInLast7(
  rows: MessageStatRow[],
  timeZone: string,
): ClientDashboardDayVolume[] {
  const template = last7DaysVolumeTemplate(timeZone);
  const indexByKey = new Map(template.map((d, i) => [d.key, i]));
  for (const row of rows) {
    if (!isCountableMessage(row)) {
      continue;
    }
    const key = dateKeyInTimeZone(row.created_at, timeZone);
    const idx = indexByKey.get(key);
    if (idx !== undefined) {
      template[idx]!.count += smsUnitsForRow(row);
    }
  }
  return template.map(({ label, count }) => ({ label, count }));
}

async function loadDashboardCharts(
  companyId: string,
  monthRows: MessageStatRow[],
): Promise<ClientDashboardCharts> {
  const emptyDays = last7DaysVolumeTemplate(APP_SCHEDULE_TIMEZONE);

  const firstDayKey = dateKeyInTimeZone(
    new Date(Date.now() - 6 * 86_400_000).toISOString(),
    APP_SCHEDULE_TIMEZONE,
  );
  const rangeStart =
    buildScheduledIsoInTimeZone(firstDayKey, "00:00") ??
    dayStartIsoInTimeZone(new Date(), APP_SCHEDULE_TIMEZONE);

  const { data: weekMessages, error } = await getSupabase()
    .from("panel_sms_messages")
    .select("status, mode, created_at, cost_sms")
    .eq("company_id", companyId)
    .gte("created_at", rangeStart);

  const todayKey = dayStartIsoInTimeZone(new Date(), APP_SCHEDULE_TIMEZONE);
  const todayRows = monthRows.filter((m) =>
    isTodayInChile(m.created_at, todayKey),
  );

  if (error) {
    if (isMissingTableError(error)) {
      return {
        dlrBreakdown: breakdownFromMessages(todayRows),
        last7Days: emptyDays,
        todayDestinations: destinationCountFromRows(todayRows),
        todaySmsUnits: smsUnitsFromRows(todayRows),
      };
    }
    wrapSupabaseError(error, "loadDashboardCharts.week");
  }

  return {
    dlrBreakdown: breakdownFromMessages(todayRows),
    last7Days: countByDayInLast7(
      (weekMessages ?? []) as MessageStatRow[],
      APP_SCHEDULE_TIMEZONE,
    ),
    todayDestinations: destinationCountFromRows(todayRows),
    todaySmsUnits: smsUnitsFromRows(todayRows),
  };
}

async function loadDashboardMonthStats(companyId: string): Promise<{
  stats: ClientDashboardStats;
  monthRows: MessageStatRow[];
}> {
  const empty: ClientDashboardStats = {
    smsTodayTotal: 0,
    smsTodayDestinations: 0,
    smsSentMonth: 0,
    smsCostMonth: 0,
    campaignsMonth: 0,
    globalDeliveryRate: "—",
    todayDlrRate: "—",
    todayDlrDetail: "Sin envíos hoy",
  };
  const monthStart = monthStartIsoInTimeZone(new Date(), APP_SCHEDULE_TIMEZONE);
  const todayKey = dayStartIsoInTimeZone(new Date(), APP_SCHEDULE_TIMEZONE);

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
      return { stats: empty, monthRows: [] };
    }
    wrapSupabaseError(msgError, "loadDashboardMonthStats.messages");
  }
  if (globalError && !isMissingTableError(globalError)) {
    wrapSupabaseError(globalError, "loadDashboardMonthStats.global");
  }

  const monthRows = (monthMessages ?? []) as MessageStatRow[];
  const monthCountable = monthRows.filter(isCountableMessage);
  const smsCostMonth = monthRows.reduce(
    (sum, row) => sum + (Number(row.cost_sms) || 0),
    0,
  );

  const globalStats = countDeliveryStats(
    (globalMessages ?? []) as MessageStatRow[],
  );
  const todayRows = monthRows.filter((m) =>
    isTodayInChile(m.created_at, todayKey),
  );
  const todaySmsTotal = smsUnitsFromRows(todayRows);
  const todayDestinations = destinationCountFromRows(todayRows);
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
    stats: {
      smsTodayTotal: todaySmsTotal,
      smsTodayDestinations: todayDestinations,
      smsSentMonth: monthCountable.length,
      smsCostMonth,
      campaignsMonth: campaignsMonth ?? 0,
      globalDeliveryRate: deliveryRatePercent(
        globalStats.delivered,
        globalStats.total,
      ),
      todayDlrRate: deliveryRatePercent(todayStats.delivered, todayStats.total),
      todayDlrDetail:
        todayStats.total > 0
          ? `${todayStats.delivered} de ${todayStats.total} SMS confirmados por DLR`
          : "Sin envíos hoy",
    },
    monthRows,
  };
}

export async function getClientDashboardData(
  companyId: string,
  country = "CL",
  preloaded?: Pick<ClientDashboardData, "company" | "balance">,
): Promise<ClientDashboardData> {
  const { stats, monthRows } = await loadDashboardMonthStats(companyId);

  const [orders, transactions, packages, charts] = await Promise.all([
    listSmsOrdersByCompany(companyId, 20),
    listTransactionsByCompany(companyId, 10),
    listCustomerVisiblePackages(country),
    loadDashboardCharts(companyId, monthRows),
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
    charts,
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
