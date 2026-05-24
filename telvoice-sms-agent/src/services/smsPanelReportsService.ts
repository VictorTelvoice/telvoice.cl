import { getSupabase } from "../database/supabaseClient.js";
import type { PanelSmsMessageRow } from "../types/sms-panel.js";
import type { WalletTransactionRow } from "../types/wallet.js";
import { isMissingTableError } from "../utils/db-table.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { listTransactionsByCompany } from "./walletTransactionService.js";

export type ClientSmsReportData = {
  messagesSent: number;
  smsConsumed: number;
  campaignsCount: number;
  deliveredRate: string;
  mockMessages: number;
  liveTestMessages: number;
  deliveredCount: number;
  pendingCount: number;
  failedCount: number;
  dailyConsumption: { day: string; sms: number }[];
  recentMessages: PanelSmsMessageRow[];
  recentDebits: WalletTransactionRow[];
};

export async function getClientSmsReportData(
  companyId: string,
): Promise<ClientSmsReportData> {
  const empty: ClientSmsReportData = {
    messagesSent: 0,
    smsConsumed: 0,
    campaignsCount: 0,
    deliveredRate: "—",
    mockMessages: 0,
    liveTestMessages: 0,
    deliveredCount: 0,
    pendingCount: 0,
    failedCount: 0,
    dailyConsumption: [],
    recentMessages: [],
    recentDebits: [],
  };

  const { data: messages, error: msgError } = await getSupabase()
    .from("panel_sms_messages")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (msgError) {
    if (isMissingTableError(msgError)) {
      return empty;
    }
    wrapSupabaseError(msgError, "getClientSmsReportData.messages");
  }

  const rows = (messages ?? []) as PanelSmsMessageRow[];
  const delivered = rows.filter(
    (m) => m.status === "delivered" && m.mode !== "mock",
  ).length;
  const mockMessages = rows.filter((m) => m.mode === "mock").length;
  const liveTestMessages = rows.filter((m) => m.mode === "live_test").length;
  const pendingCount = rows.filter(
    (m) => m.status === "pending" || m.status === "queued",
  ).length;
  const failedCount = rows.filter(
    (m) => m.status === "failed" || m.status === "rejected",
  ).length;
  const smsConsumed = rows.reduce((sum, m) => sum + (m.cost_sms ?? 0), 0);
  const deliveredRate =
    rows.length > 0
      ? `${Math.round((delivered / rows.length) * 100)}%`
      : "—";

  const { count: campaignsCount, error: campError } = await getSupabase()
    .from("sms_campaigns")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);

  if (campError && !isMissingTableError(campError)) {
    wrapSupabaseError(campError, "getClientSmsReportData.campaigns");
  }

  const byDay = new Map<string, number>();
  for (const m of rows) {
    const day = m.created_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + (m.cost_sms ?? 0));
  }
  const dailyConsumption = [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 14)
    .map(([day, sms]) => ({ day, sms }));

  const allTx = await listTransactionsByCompany(companyId, 30);
  const recentDebits = allTx.filter((t) => t.type === "sms_debit");

  return {
    messagesSent: rows.length,
    smsConsumed,
    campaignsCount: campaignsCount ?? 0,
    deliveredRate,
    mockMessages,
    liveTestMessages,
    deliveredCount: delivered,
    pendingCount,
    failedCount,
    dailyConsumption,
    recentMessages: rows.slice(0, 10),
    recentDebits: recentDebits.slice(0, 10),
  };
}
