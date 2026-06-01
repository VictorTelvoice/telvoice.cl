import { getSupabase } from "../../database/supabaseClient.js";
import { isMissingTableError } from "../../utils/db-table.js";
import { resolveMercadoPagoInitPoint } from "../mercadoPagoClientPanelService.js";
import { listPanelAgentMessagesForAdmin } from "./panelAgentSessionService.js";
import type { SmsOrderRow } from "../../types/wallet.js";
import type {
  AgentBlockedCampaignRow,
  AgentSalesDateRange,
  AgentSalesFilters,
  AgentSalesKpis,
  AgentSalesOrderRow,
} from "../../types/agent-sales.js";
import { IVA_RATE } from "../../utils/clp-format.js";

const AGENT_PANEL_SOURCE = "agent_panel";
const ORDER_FETCH_LIMIT = 2000;
export function isAgentPanelOrder(order: Pick<SmsOrderRow, "metadata">): boolean {
  const meta = order.metadata ?? {};
  return meta.source === AGENT_PANEL_SOURCE;
}

export function parseAgentSalesFilters(
  query: Record<string, string | string[] | undefined>,
): AgentSalesFilters {
  const pick = (key: string): string => {
    const v = query[key];
    return typeof v === "string" ? v.trim() : "";
  };

  const dateRanges = ["all", "today", "7d", "30d", "month"] as const;
  const dateRaw = pick("date_range");
  const dateRange = dateRanges.includes(dateRaw as AgentSalesDateRange)
    ? (dateRaw as AgentSalesDateRange)
    : "all";

  const payRaw = pick("payment_status");
  const paymentStatus =
    payRaw === "pending" || payRaw === "paid" || payRaw === "cancelled"
      ? payRaw
      : "all";

  const channelRaw = pick("channel");
  const channel =
    channelRaw === "web_client" ||
    channelRaw === "landing" ||
    channelRaw === "telegram"
      ? channelRaw
      : "all";

  const sourceRaw = pick("source");
  const source =
    sourceRaw === "agent_panel" || sourceRaw === "web_agent" ? sourceRaw : "all";

  const tabRaw = pick("tab");
  const tab =
    tabRaw === "orders" || tabRaw === "blocked" ? tabRaw : "overview";

  const minSmsRaw = pick("min_sms");
  const maxSmsRaw = pick("max_sms");

  return {
    dateRange,
    companyId: pick("company_id") || undefined,
    paymentStatus,
    channel,
    source,
    minSms: minSmsRaw && /^\d+$/.test(minSmsRaw) ? Number(minSmsRaw) : undefined,
    maxSms: maxSmsRaw && /^\d+$/.test(maxSmsRaw) ? Number(maxSmsRaw) : undefined,
    tab,
  };
}

export function agentSalesFiltersToQuery(filters: AgentSalesFilters): string {
  const q = new URLSearchParams();
  if (filters.dateRange !== "all") q.set("date_range", filters.dateRange);
  if (filters.companyId) q.set("company_id", filters.companyId);
  if (filters.paymentStatus && filters.paymentStatus !== "all") {
    q.set("payment_status", filters.paymentStatus);
  }
  if (filters.channel && filters.channel !== "all") q.set("channel", filters.channel);
  if (filters.source && filters.source !== "all") q.set("source", filters.source);
  if (filters.minSms !== undefined) q.set("min_sms", String(filters.minSms));
  if (filters.maxSms !== undefined) q.set("max_sms", String(filters.maxSms));
  if (filters.tab && filters.tab !== "overview") q.set("tab", filters.tab);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function dateRangeToBounds(
  range: AgentSalesDateRange,
): { from: Date | null; to: Date } {
  const to = new Date();
  if (range === "all") {
    return { from: null, to };
  }
  const from = new Date(to);
  if (range === "today") {
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }
  if (range === "7d") {
    from.setDate(from.getDate() - 7);
    return { from, to };
  }
  if (range === "30d") {
    from.setDate(from.getDate() - 30);
    return { from, to };
  }
  if (range === "month") {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }
  return { from: null, to };
}

function inDateRange(
  iso: string,
  from: Date | null,
  to: Date,
): boolean {
  const d = new Date(iso);
  if (from && d < from) return false;
  if (d > to) return false;
  return true;
}

function amountBreakdownFromTotal(amount: number): {
  subtotal_net: number;
  iva: number;
} {
  const subtotal_net = Math.round(amount / (1 + IVA_RATE));
  const iva = amount - subtotal_net;
  return { subtotal_net, iva };
}

function orderToRow(
  order: SmsOrderRow,
  companyName: string | null,
): AgentSalesOrderRow {
  const meta = order.metadata ?? {};
  const qty = Number(meta.agent_sms_quantity ?? order.sms_quantity ?? 0);
  const fromMeta =
    meta.subtotal_net != null && meta.iva != null
      ? {
          subtotal_net: Number(meta.subtotal_net),
          iva: Number(meta.iva),
        }
      : amountBreakdownFromTotal(order.amount);

  return {
    id: order.id,
    created_at: order.created_at,
    company_id: order.company_id,
    company_name: companyName,
    contact_email:
      typeof meta.payer_email === "string"
        ? meta.payer_email
        : typeof meta.agent_payer_email === "string"
          ? meta.agent_payer_email
          : null,
    sms_quantity: qty,
    subtotal_net: fromMeta.subtotal_net,
    iva: fromMeta.iva,
    amount: order.amount,
    payment_status: order.payment_status,
    credit_status: order.credit_status,
    source: String(meta.source ?? AGENT_PANEL_SOURCE),
    channel: "panel cliente",
    checkout_url: resolveMercadoPagoInitPoint(order),
    preference_id:
      typeof meta.mercadopago_preference_id === "string"
        ? meta.mercadopago_preference_id
        : null,
    agent_session_id:
      typeof meta.agent_session_id === "string" ? meta.agent_session_id : null,
    payment_link_reused: meta.agent_payment_link_reused === true,
  };
}

async function fetchAgentPanelOrders(): Promise<
  Array<SmsOrderRow & { company_name?: string }>
> {
  const { data, error } = await getSupabase()
    .from("sms_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(ORDER_FETCH_LIMIT);

  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }

  const orders = ((data ?? []) as SmsOrderRow[]).filter(isAgentPanelOrder);
  if (orders.length === 0) return [];

  const companyIds = [
    ...new Set(orders.map((o) => o.company_id).filter(Boolean)),
  ] as string[];

  const { data: companies } = await getSupabase()
    .from("companies")
    .select("id, name")
    .in("id", companyIds);

  const companyMap = new Map(
    ((companies ?? []) as { id: string; name: string }[]).map((c) => [
      c.id,
      c.name,
    ]),
  );

  return orders.map((o) => ({
    ...o,
    company_name: o.company_id ? companyMap.get(o.company_id) : undefined,
  }));
}

async function countSalesEvents(
  eventType: string,
  filters: AgentSalesFilters,
  bounds: { from: Date | null; to: Date },
): Promise<number> {
  let q = getSupabase()
    .from("agent_sales_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", eventType);

  if (filters.companyId) {
    q = q.eq("company_id", filters.companyId);
  }
  if (bounds.from) {
    q = q.gte("created_at", bounds.from.toISOString());
  }
  q = q.lte("created_at", bounds.to.toISOString());

  const { count, error } = await q;
  if (error) {
    if (isMissingTableError(error)) return 0;
    console.warn("[agentSalesMetrics] countSalesEvents", eventType, error.message);
    return 0;
  }
  return count ?? 0;
}

async function countQuoteMessagesFallback(
  _filters: AgentSalesFilters,
  bounds: { from: Date | null; to: Date },
): Promise<number> {
  let q = getSupabase()
    .from("panel_agent_messages")
    .select("id, metadata, created_at")
    .eq("role", "assistant")
    .limit(3000);

  if (bounds.from) {
    q = q.gte("created_at", bounds.from.toISOString());
  }
  q = q.lte("created_at", bounds.to.toISOString());

  const { data, error } = await q;
  if (error) {
    if (isMissingTableError(error)) return 0;
    return 0;
  }

  return (data ?? []).filter((row) => {
    const meta = (row as { metadata?: Record<string, unknown> }).metadata ?? {};
    const intent = meta.intent;
    if (intent === "quote_purchase" || intent === "purchase_quote") {
      return true;
    }
    const content = String((row as { content?: string }).content ?? "");
    return (
      content.includes("Precio unitario neto") &&
      content.includes("Total con IVA")
    );
  }).length;
}

function filterOrders(
  orders: Array<SmsOrderRow & { company_name?: string }>,
  filters: AgentSalesFilters,
  bounds: { from: Date | null; to: Date },
): Array<SmsOrderRow & { company_name?: string }> {
  return orders.filter((o) => {
    if (!inDateRange(o.created_at, bounds.from, bounds.to)) return false;
    if (filters.companyId && o.company_id !== filters.companyId) return false;
    if (filters.paymentStatus === "pending" && o.payment_status !== "pending") {
      return false;
    }
    if (
      filters.paymentStatus === "paid" &&
      o.payment_status !== "paid"
    ) {
      return false;
    }
    if (
      filters.paymentStatus === "cancelled" &&
      o.payment_status !== "cancelled" &&
      o.payment_status !== "rejected"
    ) {
      return false;
    }
    const qty = Number((o.metadata ?? {}).agent_sms_quantity ?? o.sms_quantity);
    if (filters.minSms !== undefined && qty < filters.minSms) return false;
    if (filters.maxSms !== undefined && qty > filters.maxSms) return false;
    return true;
  });
}

/** Métricas puras para tests. */
export function computeAgentSalesKpis(input: {
  orders: Pick<SmsOrderRow, "payment_status" | "amount" | "sms_quantity" | "metadata">[];
  quotesCount: number;
  blockedCount: number;
}): AgentSalesKpis {
  const withCheckout = input.orders.filter((o) => {
    const meta = o.metadata ?? {};
    return Boolean(
      meta.mercadopago_init_point ||
        meta.mercadopago_preference_id ||
        meta.checkout_url,
    );
  });

  const pending = input.orders.filter((o) => o.payment_status === "pending");
  const paid = input.orders.filter((o) => o.payment_status === "paid");

  const potentialAmountClp = input.orders.reduce((s, o) => s + o.amount, 0);
  const paidAmountClp = paid.reduce((s, o) => s + o.amount, 0);
  const smsSold = paid.reduce((s, o) => {
    const meta = o.metadata ?? {};
    return s + Number(meta.agent_sms_quantity ?? o.sms_quantity ?? 0);
  }, 0);

  const links = withCheckout.length;
  const conversionRate =
    links > 0 ? Math.round((paid.length / links) * 1000) / 1000 : 0;
  const averagePaidOrderClp =
    paid.length > 0 ? Math.round(paidAmountClp / paid.length) : 0;

  return {
    quotesGenerated: input.quotesCount,
    paymentLinksGenerated: links,
    pendingOrders: pending.length,
    paidOrders: paid.length,
    smsSold,
    potentialAmountClp,
    paidAmountClp,
    blockedByBalance: input.blockedCount,
    conversionRate,
    averagePaidOrderClp,
    purchaseIntentConversations: 0,
  };
}

export type AgentSalesDashboardData = {
  filters: AgentSalesFilters;
  kpis: AgentSalesKpis;
  orders: AgentSalesOrderRow[];
  blocked: AgentBlockedCampaignRow[];
  topCompanies: { company_id: string; company_name: string; interactions: number }[];
  companies: { id: string; name: string }[];
};

export async function loadAgentSalesDashboard(
  filters: AgentSalesFilters,
): Promise<AgentSalesDashboardData> {
  const bounds = dateRangeToBounds(filters.dateRange);
  const allOrders = await fetchAgentPanelOrders();
  const filteredOrders = filterOrders(allOrders, filters, bounds);

  const [quotesFromEvents, blockedFromEvents, purchaseIntentCount] =
    await Promise.all([
      countSalesEvents("quote_created", filters, bounds),
      countSalesEvents("insufficient_balance_detected", filters, bounds),
      countPurchaseIntentSessions(filters, bounds),
    ]);

  const quotesFallback =
    quotesFromEvents === 0
      ? await countQuoteMessagesFallback(filters, bounds)
      : 0;

  const quotesGenerated = quotesFromEvents + quotesFallback;

  const blockedFallback = countBlockedFromOrders(filteredOrders);
  const blockedByBalance = Math.max(blockedFromEvents, blockedFallback);

  const kpis = computeAgentSalesKpis({
    orders: filteredOrders,
    quotesCount: quotesGenerated,
    blockedCount: blockedByBalance,
  });
  kpis.purchaseIntentConversations = purchaseIntentCount;

  const orders = filteredOrders.map((o) =>
    orderToRow(o, o.company_name ?? null),
  );

  const blocked = await loadBlockedCampaigns(filters, bounds, allOrders);

  const topCompanies = await loadTopAgentCompanies(bounds);

  const companies = await loadCompaniesForFilter();

  return {
    filters,
    kpis,
    orders,
    blocked,
    topCompanies,
    companies,
  };
}

function countBlockedFromOrders(
  orders: Pick<SmsOrderRow, "metadata">[],
): number {
  return orders.filter((o) => {
    const meta = o.metadata ?? {};
    return meta.agent_blocked_send != null;
  }).length;
}

async function countPurchaseIntentSessions(
  _filters: AgentSalesFilters,
  bounds: { from: Date | null; to: Date },
): Promise<number> {
  let q = getSupabase()
    .from("panel_agent_messages")
    .select("session_id")
    .eq("role", "assistant")
    .limit(4000);

  if (bounds.from) {
    q = q.gte("created_at", bounds.from.toISOString());
  }
  q = q.lte("created_at", bounds.to.toISOString());

  const { data, error } = await q;
  if (error) {
    if (isMissingTableError(error)) return 0;
    return 0;
  }

  const sessions = new Set<string>();
  for (const row of data ?? []) {
    const meta = (row as { metadata?: Record<string, unknown> }).metadata ?? {};
    const intent = meta.intent;
    if (
      intent === "quote_purchase" ||
      intent === "purchase_quote" ||
      intent === "confirm_purchase"
    ) {
      sessions.add(String((row as { session_id: string }).session_id));
    }
  }
  return sessions.size;
}

async function loadBlockedCampaigns(
  filters: AgentSalesFilters,
  bounds: { from: Date | null; to: Date },
  orders: Array<SmsOrderRow & { company_name?: string }>,
): Promise<AgentBlockedCampaignRow[]> {
  let q = getSupabase()
    .from("agent_sales_events")
    .select("*")
    .eq("event_type", "insufficient_balance_detected")
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.companyId) {
    q = q.eq("company_id", filters.companyId);
  }
  if (bounds.from) {
    q = q.gte("created_at", bounds.from.toISOString());
  }
  q = q.lte("created_at", bounds.to.toISOString());

  const { data: events, error } = await q;

  const rows: AgentBlockedCampaignRow[] = [];

  if (!error && events?.length) {
    const companyIds = [
      ...new Set(
        (events as { company_id?: string }[])
          .map((e) => e.company_id)
          .filter(Boolean),
      ),
    ] as string[];

    const companyMap = await loadCompanyNameMap(companyIds);

    for (const ev of events as Array<{
      id: string;
      created_at: string;
      company_id: string | null;
      session_id: string | null;
      quantity_sms: number | null;
      order_id: string | null;
      metadata: Record<string, unknown>;
    }>) {
      const meta = ev.metadata ?? {};
      const available = Number(meta.available_sms ?? 0);
      const required = Number(
        meta.required_sms ?? ev.quantity_sms ?? 0,
      );
      const shortfall = Math.max(0, required - available);
      const relatedOrder = ev.order_id
        ? orders.find((o) => o.id === ev.order_id)
        : undefined;

      rows.push({
        id: ev.id,
        created_at: ev.created_at,
        company_id: ev.company_id,
        company_name: ev.company_id
          ? companyMap.get(ev.company_id) ?? null
          : null,
        session_id: ev.session_id,
        available_sms: available,
        required_sms: required,
        shortfall_sms: shortfall,
        recommended_bag: Number(meta.recommended_bag ?? 0),
        generated_payment_link: Boolean(ev.order_id || meta.order_id),
        order_id: ev.order_id,
        order_paid: relatedOrder?.payment_status === "paid",
        metadata: meta,
      });
    }
    return rows;
  }

  for (const o of orders) {
    const meta = o.metadata ?? {};
    const blocked = meta.agent_blocked_send as Record<string, unknown> | undefined;
    if (!blocked) continue;
    if (!inDateRange(o.created_at, bounds.from, bounds.to)) continue;
    if (filters.companyId && o.company_id !== filters.companyId) continue;

    const available = Number(blocked.available_sms ?? 0);
    const required = Number(blocked.required_sms ?? o.sms_quantity ?? 0);

    rows.push({
      id: `order-${o.id}`,
      created_at: o.created_at,
      company_id: o.company_id,
      company_name: o.company_name ?? null,
      session_id:
        typeof meta.agent_session_id === "string"
          ? meta.agent_session_id
          : null,
      available_sms: available,
      required_sms: required,
      shortfall_sms: Math.max(0, required - available),
      recommended_bag: Number(blocked.recommended_bag ?? o.sms_quantity ?? 0),
      generated_payment_link: true,
      order_id: o.id,
      order_paid: o.payment_status === "paid",
      metadata: blocked,
    });
  }

  return rows.slice(0, 200);
}

async function loadCompanyNameMap(
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await getSupabase()
    .from("companies")
    .select("id, name")
    .in("id", ids);
  return new Map(
    ((data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
  );
}

async function loadTopAgentCompanies(
  bounds: { from: Date | null; to: Date },
): Promise<{ company_id: string; company_name: string; interactions: number }[]> {
  let q = getSupabase()
    .from("panel_agent_sessions")
    .select("company_id")
    .limit(5000);

  if (bounds.from) {
    q = q.gte("created_at", bounds.from.toISOString());
  }
  q = q.lte("created_at", bounds.to.toISOString());

  const { data, error } = await q;
  if (error) {
    if (isMissingTableError(error)) return [];
    return [];
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const cid = (row as { company_id: string }).company_id;
    if (!cid) continue;
    counts.set(cid, (counts.get(cid) ?? 0) + 1);
  }

  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const names = await loadCompanyNameMap(sorted.map(([id]) => id));

  return sorted.map(([company_id, interactions]) => ({
    company_id,
    company_name: names.get(company_id) ?? company_id.slice(0, 8),
    interactions,
  }));
}

async function loadCompaniesForFilter(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await getSupabase()
    .from("companies")
    .select("id, name")
    .order("name")
    .limit(500);

  if (error) return [];
  return (data ?? []) as { id: string; name: string }[];
}

export async function loadAgentSalesConversation(sessionId: string): Promise<{
  sessionId: string;
  companyId: string | null;
  companyName: string | null;
  messages: Awaited<ReturnType<typeof listPanelAgentMessagesForAdmin>>;
  relatedOrders: AgentSalesOrderRow[];
}> {
  const { data: session } = await getSupabase()
    .from("panel_agent_sessions")
    .select("id, company_id")
    .eq("id", sessionId)
    .maybeSingle();

  const companyId = (session as { company_id?: string } | null)?.company_id ?? null;
  let companyName: string | null = null;
  if (companyId) {
    const map = await loadCompanyNameMap([companyId]);
    companyName = map.get(companyId) ?? null;
  }

  const messages = await listPanelAgentMessagesForAdmin(sessionId, 80);

  const allOrders = await fetchAgentPanelOrders();
  const relatedOrders = allOrders
    .filter((o) => {
      const sid = (o.metadata ?? {}).agent_session_id;
      return sid === sessionId;
    })
    .map((o) => orderToRow(o, o.company_name ?? companyName));

  return {
    sessionId,
    companyId,
    companyName,
    messages,
    relatedOrders,
  };
}
