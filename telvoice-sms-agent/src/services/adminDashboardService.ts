import { createPgClient } from "../database/pgClient.js";
import type { AdminDashboardSnapshot } from "../types/adminDashboard.js";
import { APP_SCHEDULE_TIMEZONE } from "../utils/scheduleTime.js";
import {
  companyIdsToPgArray,
  loadOperationalCompanyIdsFallback,
  loadProductionCompanyIds,
} from "./adminProductionScopeService.js";
import {
  emailLooksQa,
  normalizeAuditEmail,
  orderLooksQa,
} from "./adminDataAuditClassifier.js";

const LOW_BALANCE_THRESHOLD = 500;
const COUNTABLE_MSG_STATUSES = ["sent", "submitted", "delivered", "failed", "rejected"];
const ACTIVE_CAMPAIGN_STATUSES = ["processing"];

function emptySnapshot(): AdminDashboardSnapshot {
  return {
    activeClients: 0,
    smsToday: 0,
    smsMonth: 0,
    totalPurchasedSms: 0,
    totalConsumedSms: 0,
    activeCampaigns: 0,
    deliveryRate: null,
    failedLast24h: 0,
    activeWallets: 0,
    pendingOrders: 0,
    paidPendingCredit: 0,
    paidPendingClaim: 0,
    lowBalanceCompanies: 0,
    chart7Days: { labels: [], values: [] },
    topClients: [],
    recentCampaigns: [],
    operationalAlerts: [],
    productionCompanyCount: 0,
  };
}

function formatRate(delivered: number, total: number): string | null {
  if (total <= 0) return null;
  return `${((delivered / total) * 100).toFixed(1).replace(".", ",")}%`;
}

function last7DayLabels(): string[] {
  const labels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(
      d.toLocaleDateString("es-CL", {
        weekday: "short",
        day: "numeric",
        timeZone: APP_SCHEDULE_TIMEZONE,
      }),
    );
  }
  return labels;
}

export async function getAdminDashboardSnapshot(): Promise<AdminDashboardSnapshot> {
  let companyIds = await loadProductionCompanyIds();
  if (companyIds.size === 0) {
    companyIds = await loadOperationalCompanyIdsFallback();
  }
  if (companyIds.size === 0) {
    return emptySnapshot();
  }

  const ids = companyIdsToPgArray(companyIds);
  const client = createPgClient();
  await client.connect();

  try {
    const [
      msgTodayRes,
      msgMonthRes,
      msgWeekRes,
      msgFailedRes,
      walletRes,
      pendingOrdersRes,
      paidPendingRes,
      paidClaimRes,
      campaignsActiveRes,
      topClientsRes,
      recentCampaignsRes,
    ] = await Promise.all([
      client.query(
        `
        SELECT COUNT(*)::int AS c
        FROM panel_sms_messages
        WHERE company_id = ANY($1::uuid[])
          AND mode IN ('live', 'live_test')
          AND status = ANY($2::text[])
          AND created_at >= date_trunc('day', now() AT TIME ZONE $3)
        `,
        [ids, COUNTABLE_MSG_STATUSES, APP_SCHEDULE_TIMEZONE],
      ),
      client.query(
        `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
          COUNT(*) FILTER (WHERE status IN ('failed', 'rejected'))::int AS failed
        FROM panel_sms_messages
        WHERE company_id = ANY($1::uuid[])
          AND mode IN ('live', 'live_test')
          AND status = ANY($2::text[])
          AND created_at >= date_trunc('month', now() AT TIME ZONE $3)
        `,
        [ids, COUNTABLE_MSG_STATUSES, APP_SCHEDULE_TIMEZONE],
      ),
      client.query(
        `
        SELECT
          to_char(date_trunc('day', created_at AT TIME ZONE $3), 'Dy DD') AS day_label,
          date_trunc('day', created_at AT TIME ZONE $3) AS day_bucket,
          COUNT(*)::int AS c
        FROM panel_sms_messages
        WHERE company_id = ANY($1::uuid[])
          AND mode IN ('live', 'live_test')
          AND status = ANY($2::text[])
          AND created_at >= (now() AT TIME ZONE $3 - interval '6 days')
        GROUP BY 1, 2
        ORDER BY day_bucket
        `,
        [ids, COUNTABLE_MSG_STATUSES, APP_SCHEDULE_TIMEZONE],
      ),
      client.query(
        `
        SELECT COUNT(*)::int AS c
        FROM panel_sms_messages
        WHERE company_id = ANY($1::uuid[])
          AND mode IN ('live', 'live_test')
          AND status IN ('failed', 'rejected')
          AND created_at >= now() - interval '24 hours'
        `,
        [ids],
      ),
      client.query(
        `
        SELECT
          COALESCE(SUM(total_purchased_sms), 0)::bigint AS purchased,
          COALESCE(SUM(consumed_sms), 0)::bigint AS consumed,
          COUNT(*) FILTER (WHERE status = 'active')::int AS active_wallets,
          COUNT(*) FILTER (WHERE available_sms < $2)::int AS low_balance
        FROM company_sms_wallets
        WHERE company_id = ANY($1::uuid[])
        `,
        [ids, LOW_BALANCE_THRESHOLD],
      ),
      client.query(
        `
        SELECT COUNT(*)::int AS c
        FROM sms_orders o
        WHERE o.payment_status = 'pending'
          AND (
            o.company_id = ANY($1::uuid[])
            OR (
              o.company_id IS NULL
              AND NOT (
                lower(coalesce(o.checkout_email, o.payer_email, '')) ~ '@(telvoice\\.test|example\\.invalid)$'
              )
            )
          )
        `,
        [ids],
      ),
      client.query(
        `
        SELECT COUNT(*)::int AS c
        FROM sms_orders o
        WHERE o.payment_status = 'paid'
          AND o.credit_status = 'pending'
          AND (
            o.company_id = ANY($1::uuid[])
            OR o.company_id IS NOT NULL
          )
          AND NOT EXISTS (
            SELECT 1 FROM wallet_transactions wt
            WHERE wt.reference_type = 'sms_order'
              AND wt.reference_id = o.id
              AND wt.type = 'purchase_credit'
          )
        `,
        [ids],
      ),
      client.query(
        `
        SELECT COUNT(*)::int AS c
        FROM sms_orders o
        WHERE o.payment_status = 'paid'
          AND o.credit_status = 'pending_claim'
          AND NOT EXISTS (
            SELECT 1 FROM wallet_transactions wt
            WHERE wt.reference_type = 'sms_order'
              AND wt.reference_id = o.id
              AND wt.type = 'purchase_credit'
          )
        `,
      ),
      client.query(
        `
        SELECT COUNT(*)::int AS c
        FROM sms_campaigns c
        WHERE c.company_id = ANY($1::uuid[])
          AND c.status = ANY($2::text[])
        `,
        [ids, ACTIVE_CAMPAIGN_STATUSES],
      ),
      client.query(
        `
        SELECT
          c.id AS company_id,
          c.name,
          w.consumed_sms,
          w.available_sms,
          COALESCE(msg.delivered, 0)::int AS delivered,
          COALESCE(msg.total, 0)::int AS msg_total
        FROM companies c
        JOIN company_sms_wallets w ON w.company_id = c.id
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered
          FROM panel_sms_messages m
          WHERE m.company_id = c.id
            AND m.mode IN ('live', 'live_test')
        ) msg ON true
        WHERE c.id = ANY($1::uuid[])
        ORDER BY w.consumed_sms DESC
        LIMIT 5
        `,
        [ids],
      ),
      client.query(
        `
        SELECT
          co.name AS company_name,
          sc.name AS campaign_name,
          sc.status,
          sc.created_at,
          COALESCE(sc.total_recipients, 0)::int AS sent,
          0::int AS delivered
        FROM sms_campaigns sc
        JOIN companies co ON co.id = sc.company_id
        WHERE sc.company_id = ANY($1::uuid[])
        ORDER BY sc.created_at DESC
        LIMIT 5
        `,
        [ids],
      ),
    ]);

    const labels = last7DayLabels();
    const weekMap = new Map<string, number>();
    for (const row of msgWeekRes.rows) {
      weekMap.set(String(row.day_label), Number(row.c));
    }
    const chartValues = labels.map((label) => weekMap.get(label) ?? 0);

    const month = msgMonthRes.rows[0] ?? {};
    const wallet = walletRes.rows[0] ?? {};

    const operationalAlerts: string[] = [];
    const paidClaim = Number(paidClaimRes.rows[0]?.c ?? 0);
    const paidPending = Number(paidPendingRes.rows[0]?.c ?? 0);
    const lowBalance = Number(wallet.low_balance ?? 0);
    if (paidClaim > 0) {
      operationalAlerts.push(
        `${paidClaim} compra(s) pagada(s) por MercadoPago sin acreditar saldo.`,
      );
    }
    if (paidPending > 0) {
      operationalAlerts.push(
        `${paidPending} orden(es) pagada(s) pendientes de acreditación técnica.`,
      );
    }
    if (lowBalance > 0) {
      operationalAlerts.push(
        `${lowBalance} cliente(s) real(es) con saldo bajo (< ${LOW_BALANCE_THRESHOLD} SMS).`,
      );
    }
    if (operationalAlerts.length === 0) {
      operationalAlerts.push("Sin alertas operativas críticas en clientes reales.");
    }

    return {
      activeClients: companyIds.size,
      smsToday: Number(msgTodayRes.rows[0]?.c ?? 0),
      smsMonth: Number(month.total ?? 0),
      totalPurchasedSms: Number(wallet.purchased ?? 0),
      totalConsumedSms: Number(wallet.consumed ?? 0),
      activeCampaigns: Number(campaignsActiveRes.rows[0]?.c ?? 0),
      deliveryRate: formatRate(
        Number(month.delivered ?? 0),
        Number(month.total ?? 0),
      ),
      failedLast24h: Number(msgFailedRes.rows[0]?.c ?? 0),
      activeWallets: Number(wallet.active_wallets ?? 0),
      pendingOrders: Number(pendingOrdersRes.rows[0]?.c ?? 0),
      paidPendingCredit: paidPending,
      paidPendingClaim: paidClaim,
      lowBalanceCompanies: lowBalance,
      chart7Days: { labels, values: chartValues },
      topClients: topClientsRes.rows.map((row) => ({
        companyId: String(row.company_id),
        name: String(row.name),
        consumed: Number(row.consumed_sms ?? 0),
        balance: Number(row.available_sms ?? 0),
        deliveryRate:
          formatRate(Number(row.delivered ?? 0), Number(row.msg_total ?? 0)) ??
          "—",
      })),
      recentCampaigns: recentCampaignsRes.rows.map((row) => ({
        companyName: String(row.company_name),
        name: String(row.campaign_name),
        sent: Number(row.sent ?? 0),
        delivered: Number(row.delivered ?? 0),
        status: String(row.status ?? ""),
        createdAt: String(row.created_at ?? ""),
      })),
      operationalAlerts,
      productionCompanyCount: companyIds.size,
    };
  } finally {
    await client.end();
  }
}

/** Filtra órdenes reales (no QA/test) para métricas de compras. */
export function orderCountsAsRealPurchase(row: {
  checkout_email?: string | null;
  payer_email?: string | null;
  metadata?: unknown;
  id?: string;
}): boolean {
  if (orderLooksQa(row as Record<string, unknown>)) return false;
  const email = normalizeAuditEmail(row.checkout_email ?? row.payer_email);
  if (emailLooksQa(email)) return false;
  return true;
}
