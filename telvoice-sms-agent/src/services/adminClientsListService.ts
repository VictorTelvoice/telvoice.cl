/**
 * Listado operativo de clientes superadmin.
 *
 * TODO seguridad acciones sensibles (saldos, rate plan, suspender, archivar):
 * - audit log con usuario actor
 * - confirmación literal del operador
 * - bloqueo si protected=true salvo override superadmin documentado
 * - sin hard delete para clientes PROD_REAL
 * - dry-run obligatorio en mutaciones de saldo/rate plan
 */
import { createPgClient } from "../database/pgClient.js";
import type { AuditClassification } from "../types/adminDataAudit.js";
import type {
  AdminClientAuditInfo,
  AdminClientDetailApiKey,
  AdminClientDetailRecentEmail,
  AdminClientDetailRecentInvoice,
  AdminClientDetailRecentMessage,
  AdminClientDetailRecentOrder,
  AdminClientDetailWalletTransaction,
  AdminClientDetailWebhook,
  AdminClientListItem,
  AdminClientOperationalDetail,
  AdminClientOperationalFlags,
  AdminClientOperationalItem,
  AdminClientOperationalPurchases,
  AdminClientOperationalUsage,
  AdminClientOperationalWallet,
  AdminClientScope,
  AdminClientStatusFilter,
  AdminClientsListResult,
  AdminClientsScopeSummary,
} from "../types/adminClientsList.js";
import type { CompanyRow } from "../types/tenant.js";
import { APP_SCHEDULE_TIMEZONE } from "../utils/scheduleTime.js";
import {
  companyNameLooksQa,
  emailLooksQa,
  normalizeAuditEmail,
  orderHasRealPayment,
  orderLooksQa,
  PROTECTED_CLIENT_EMAILS,
} from "./adminDataAuditClassifier.js";

const QA_EMAIL_DOMAIN_RE = /@(telvoice\.test|example\.invalid)$/i;
const QA_NAME_PREFIX_RE = /^qa\s/i;
const COUNTABLE_MSG_STATUSES = ["sent", "submitted", "delivered", "failed", "rejected"];
const DEFAULT_PAGE_SIZE = 100;

type CompanyRealSignals = {
  realPaidOrders: Set<string>;
  walletCredit: Set<string>;
  liveSms: Set<string>;
};

type WalletAgg = {
  available_sms: number;
  total_purchased_sms: number;
  consumed_sms: number;
  reserved_sms: number;
  status: string | null;
};

type UsageAgg = {
  sms_today: number;
  sms_month: number;
  failed_last_24h: number;
  last_sms_at: string | null;
  campaigns_count: number;
  transactional_emails_sent: number;
};

type PurchaseAgg = {
  orders_count: number;
  paid_orders_count: number;
  paid_pending_credit_count: number;
  last_purchase_at: string | null;
  last_order_id: string | null;
  last_invoice_number: string | null;
  last_invoice_at: string | null;
};

type RatePlanAgg = {
  rate_plan_name: string | null;
  rate_plan_code: string | null;
  live_enabled: boolean | null;
  campaigns_enabled: boolean | null;
  api_enabled: boolean | null;
  created_at: string | null;
};

type OperationalMaps = {
  wallets: Map<string, WalletAgg>;
  usage: Map<string, UsageAgg>;
  purchases: Map<string, PurchaseAgg>;
  ratePlans: Map<string, RatePlanAgg>;
};

async function loadCompanyRealSignals(client: {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}): Promise<CompanyRealSignals> {
  const [ordersRes, walletRes, liveRes] = await Promise.all([
    client.query(`
      SELECT company_id, payment_status, credit_status, metadata,
             payer_email, checkout_email, id
      FROM sms_orders
      WHERE payment_status = 'paid' OR credit_status = 'credited'
    `),
    client.query(`
      SELECT DISTINCT company_id::text AS company_id
      FROM wallet_transactions
      WHERE type IN ('purchase_credit', 'manual_credit') AND sms_amount > 0
    `),
    client.query(`
      SELECT DISTINCT company_id::text AS company_id
      FROM panel_sms_messages
      WHERE mode = 'live' AND status IN ('sent', 'delivered', 'submitted')
    `),
  ]);

  const realPaidOrders = new Set<string>();
  for (const row of ordersRes.rows) {
    if (!row.company_id) continue;
    if (orderHasRealPayment(row) && !orderLooksQa(row)) {
      realPaidOrders.add(String(row.company_id));
    }
  }

  return {
    realPaidOrders,
    walletCredit: new Set(walletRes.rows.map((r) => String(r.company_id))),
    liveSms: new Set(liveRes.rows.map((r) => String(r.company_id))),
  };
}

async function loadOperationalMaps(client: {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}): Promise<OperationalMaps> {
  const tz = APP_SCHEDULE_TIMEZONE;
  const statuses = COUNTABLE_MSG_STATUSES;

  const [walletRes, usageRes, purchaseRes, ratePlanRes, campRes, emailRes] =
    await Promise.all([
    client.query(`
      SELECT company_id::text AS company_id, available_sms, total_purchased_sms,
             consumed_sms, reserved_sms, status
      FROM company_sms_wallets
    `),
    client.query(
      `
      SELECT
        company_id::text AS company_id,
        COUNT(*) FILTER (
          WHERE created_at >= date_trunc('day', now() AT TIME ZONE $2)
        )::int AS sms_today,
        COUNT(*) FILTER (
          WHERE created_at >= date_trunc('month', now() AT TIME ZONE $2)
        )::int AS sms_month,
        COUNT(*) FILTER (
          WHERE status IN ('failed', 'rejected')
            AND created_at >= now() - interval '24 hours'
        )::int AS failed_last_24h,
        MAX(created_at)::text AS last_sms_at
      FROM panel_sms_messages
      WHERE mode IN ('live', 'live_test')
        AND status = ANY($1::text[])
      GROUP BY company_id
      `,
      [statuses, tz],
    ),
    client.query(`
      WITH ord AS (
        SELECT
          company_id::text AS company_id,
          COUNT(*)::int AS orders_count,
          COUNT(*) FILTER (WHERE payment_status = 'paid')::int AS paid_orders_count,
          COUNT(*) FILTER (
            WHERE payment_status = 'paid' AND credit_status IS DISTINCT FROM 'credited'
          )::int AS paid_pending_credit_count,
          MAX(created_at) FILTER (WHERE payment_status = 'paid') AS last_purchase_at,
          (array_agg(id ORDER BY created_at DESC) FILTER (WHERE payment_status = 'paid'))[1]::text AS last_order_id
        FROM sms_orders
        WHERE company_id IS NOT NULL
        GROUP BY company_id
      ),
      inv AS (
        SELECT DISTINCT ON (company_id)
          company_id::text AS company_id,
          invoice_number,
          COALESCE(issued_at, created_at) AS last_invoice_at
        FROM billing_invoices
        ORDER BY company_id, created_at DESC
      )
      SELECT
        COALESCE(o.company_id, i.company_id) AS company_id,
        COALESCE(o.orders_count, 0)::int AS orders_count,
        COALESCE(o.paid_orders_count, 0)::int AS paid_orders_count,
        COALESCE(o.paid_pending_credit_count, 0)::int AS paid_pending_credit_count,
        o.last_purchase_at::text,
        o.last_order_id,
        i.invoice_number AS last_invoice_number,
        i.last_invoice_at::text
      FROM ord o
      FULL OUTER JOIN inv i ON i.company_id = o.company_id
    `),
    client.query(`
      SELECT DISTINCT ON (crp.company_id)
        crp.company_id::text AS company_id,
        srp.name AS rate_plan_name,
        srp.code AS rate_plan_code,
        crp.live_enabled,
        crp.campaigns_enabled,
        crp.api_enabled,
        crp.created_at::text AS created_at
      FROM company_rate_plans crp
      JOIN sms_rate_plans srp ON srp.id = crp.rate_plan_id
      WHERE crp.status = 'active'
      ORDER BY crp.company_id,
        CASE crp.traffic_type
          WHEN 'transactional' THEN 0
          WHEN 'both' THEN 1
          ELSE 2
        END,
        crp.created_at DESC
    `),
    client.query(`
      SELECT company_id::text AS company_id, COUNT(*)::int AS campaigns_count
      FROM sms_campaigns
      GROUP BY company_id
    `),
    client.query(`
      SELECT company_id::text AS company_id, COUNT(*)::int AS cnt
      FROM (
        SELECT company_id FROM billing_email_logs WHERE status = 'sent' AND company_id IS NOT NULL
        UNION ALL
        SELECT company_id FROM email_logs WHERE status = 'sent' AND company_id IS NOT NULL
      ) e
      GROUP BY company_id
    `),
  ]);

  const wallets = new Map<string, WalletAgg>();
  for (const row of walletRes.rows) {
    wallets.set(String(row.company_id), {
      available_sms: Number(row.available_sms ?? 0),
      total_purchased_sms: Number(row.total_purchased_sms ?? 0),
      consumed_sms: Number(row.consumed_sms ?? 0),
      reserved_sms: Number(row.reserved_sms ?? 0),
      status: row.status != null ? String(row.status) : null,
    });
  }

  const usage = new Map<string, UsageAgg>();
  for (const row of usageRes.rows) {
    usage.set(String(row.company_id), {
      sms_today: Number(row.sms_today ?? 0),
      sms_month: Number(row.sms_month ?? 0),
      failed_last_24h: Number(row.failed_last_24h ?? 0),
      last_sms_at: row.last_sms_at != null ? String(row.last_sms_at) : null,
      campaigns_count: 0,
      transactional_emails_sent: 0,
    });
  }
  for (const row of campRes.rows) {
    const id = String(row.company_id);
    const existing = usage.get(id) ?? {
      sms_today: 0,
      sms_month: 0,
      failed_last_24h: 0,
      last_sms_at: null,
      campaigns_count: 0,
      transactional_emails_sent: 0,
    };
    existing.campaigns_count = Number(row.campaigns_count ?? 0);
    usage.set(id, existing);
  }
  for (const row of emailRes.rows) {
    const id = String(row.company_id);
    const existing = usage.get(id) ?? {
      sms_today: 0,
      sms_month: 0,
      failed_last_24h: 0,
      last_sms_at: null,
      campaigns_count: 0,
      transactional_emails_sent: 0,
    };
    existing.transactional_emails_sent = Number(row.cnt ?? 0);
    usage.set(id, existing);
  }

  const purchases = new Map<string, PurchaseAgg>();
  for (const row of purchaseRes.rows) {
    if (!row.company_id) continue;
    purchases.set(String(row.company_id), {
      orders_count: Number(row.orders_count ?? 0),
      paid_orders_count: Number(row.paid_orders_count ?? 0),
      paid_pending_credit_count: Number(row.paid_pending_credit_count ?? 0),
      last_purchase_at:
        row.last_purchase_at != null ? String(row.last_purchase_at) : null,
      last_order_id: row.last_order_id != null ? String(row.last_order_id) : null,
      last_invoice_number:
        row.last_invoice_number != null ? String(row.last_invoice_number) : null,
      last_invoice_at:
        row.last_invoice_at != null ? String(row.last_invoice_at) : null,
    });
  }

  const ratePlans = new Map<string, RatePlanAgg>();
  for (const row of ratePlanRes.rows) {
    ratePlans.set(String(row.company_id), {
      rate_plan_name: row.rate_plan_name != null ? String(row.rate_plan_name) : null,
      rate_plan_code: row.rate_plan_code != null ? String(row.rate_plan_code) : null,
      live_enabled: row.live_enabled != null ? Boolean(row.live_enabled) : null,
      campaigns_enabled:
        row.campaigns_enabled != null ? Boolean(row.campaigns_enabled) : null,
      api_enabled: row.api_enabled != null ? Boolean(row.api_enabled) : null,
      created_at: row.created_at != null ? String(row.created_at) : null,
    });
  }

  return { wallets, usage, purchases, ratePlans };
}

function emptyWallet(): AdminClientOperationalWallet {
  return {
    availableSms: 0,
    totalPurchasedSms: 0,
    consumedSms: 0,
    reservedSms: 0,
    status: null,
    hasWallet: false,
  };
}

function emptyUsage(): AdminClientOperationalUsage {
  return {
    smsToday: 0,
    smsThisMonth: 0,
    failedLast24h: 0,
    lastSmsAt: null,
    campaignsCount: 0,
    transactionalEmailsSent: 0,
  };
}

function emptyPurchases(): AdminClientOperationalPurchases {
  return {
    ordersCount: 0,
    paidOrdersCount: 0,
    paidPendingCreditCount: 0,
    lastPurchaseAt: null,
    lastOrderId: null,
    lastInvoiceNumber: null,
    lastInvoiceAt: null,
  };
}

function buildOperationalItem(
  company: CompanyRow,
  audit: AdminClientAuditInfo,
  maps: OperationalMaps,
): AdminClientOperationalItem {
  const w = maps.wallets.get(company.id);
  const u = maps.usage.get(company.id);
  const p = maps.purchases.get(company.id);
  const rp = maps.ratePlans.get(company.id);

  const wallet: AdminClientOperationalWallet = w
    ? {
        availableSms: w.available_sms,
        totalPurchasedSms: w.total_purchased_sms,
        consumedSms: w.consumed_sms,
        reservedSms: w.reserved_sms,
        status: w.status,
        hasWallet: true,
      }
    : emptyWallet();

  const usage: AdminClientOperationalUsage = u
    ? {
        smsToday: u.sms_today,
        smsThisMonth: u.sms_month,
        failedLast24h: u.failed_last_24h,
        lastSmsAt: u.last_sms_at,
        campaignsCount: u.campaigns_count,
        transactionalEmailsSent: u.transactional_emails_sent,
      }
    : emptyUsage();

  const purchases: AdminClientOperationalPurchases = p
    ? {
        ordersCount: p.orders_count,
        paidOrdersCount: p.paid_orders_count,
        paidPendingCreditCount: p.paid_pending_credit_count,
        lastPurchaseAt: p.last_purchase_at,
        lastOrderId: p.last_order_id,
        lastInvoiceNumber: p.last_invoice_number,
        lastInvoiceAt: p.last_invoice_at,
      }
    : emptyPurchases();

  const hasRatePlan = Boolean(rp?.rate_plan_name || rp?.rate_plan_code);
  const hasBalance = wallet.hasWallet && wallet.availableSms > 0;
  const noActivity =
    usage.smsToday === 0 &&
    usage.smsThisMonth === 0 &&
    usage.lastSmsAt == null &&
    purchases.paidOrdersCount === 0;
  const apiActive = Boolean(rp?.api_enabled);

  const operationalFlags: AdminClientOperationalFlags = {
    hasRatePlan,
    hasWallet: wallet.hasWallet,
    hasBalance,
    noActivity,
    needsReview:
      audit.classification === "REVIEW_REQUIRED" || audit.classification === "ORPHAN",
    isQa: audit.classification === "QA_TEST" || audit.classification === "DEMO_SEED",
    isProtected: audit.protected,
    apiActive,
    hasPaidPendingCredit: purchases.paidPendingCreditCount > 0,
  };

  return {
    companyId: company.id,
    companyName: company.name,
    billingEmail: company.billing_email,
    country: company.country ?? "CL",
    status: company.status,
    auditScope: audit.classification,
    protected: audit.protected,
    ratePlanName: rp?.rate_plan_name ?? null,
    ratePlanCode: rp?.rate_plan_code ?? null,
    ratePlanAssignedAt: rp?.created_at ?? null,
    wallet,
    usage,
    purchases,
    operationalFlags,
  };
}

function companyHasObviousQaHeuristics(company: CompanyRow): boolean {
  const email = normalizeAuditEmail(company.billing_email);
  if (PROTECTED_CLIENT_EMAILS.has(email)) return false;
  if (QA_EMAIL_DOMAIN_RE.test(email)) return true;
  if (QA_NAME_PREFIX_RE.test(String(company.name ?? ""))) return true;
  if (companyNameLooksQa(company.name) || companyNameLooksQa(company.legal_name)) return true;
  if (emailLooksQa(email)) return true;
  return false;
}

/** Clasificación explícita de auditoría como cliente real (prioridad sobre heurísticas QA). */
function isExplicitProdRealAudit(audit: AdminClientAuditInfo): boolean {
  return audit.hasFlag && audit.classification === "PROD_REAL";
}

function companyHasStrongRealSignals(
  company: CompanyRow,
  audit: AdminClientAuditInfo,
  signals: CompanyRealSignals,
): boolean {
  const email = normalizeAuditEmail(company.billing_email);
  if (PROTECTED_CLIENT_EMAILS.has(email)) return true;
  if (isExplicitProdRealAudit(audit)) return true;
  if (companyHasObviousQaHeuristics(company)) return false;
  if (signals.realPaidOrders.has(company.id)) return true;
  if (signals.liveSms.has(company.id)) return true;
  if (signals.walletCredit.has(company.id)) return true;
  if (audit.classification === "PROD_REAL") return true;
  if (audit.protected && audit.classification === "PROD_INTERNAL") return true;
  return false;
}

export function parseAdminClientScope(value: unknown): AdminClientScope {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (v === "internal" || v === "qa" || v === "review" || v === "all") return v;
  return "real";
}

export function parseAdminClientStatusFilter(value: unknown): AdminClientStatusFilter {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  const allowed: AdminClientStatusFilter[] = [
    "",
    "active",
    "suspended",
    "no_balance",
    "has_balance",
    "no_rate_plan",
    "activity_today",
    "no_activity",
    "protected",
  ];
  return allowed.includes(v as AdminClientStatusFilter)
    ? (v as AdminClientStatusFilter)
    : "";
}

function rowToCompany(row: Record<string, unknown>): CompanyRow {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    legal_name: row.legal_name != null ? String(row.legal_name) : null,
    rut: row.rut != null ? String(row.rut) : null,
    billing_email: row.billing_email != null ? String(row.billing_email) : null,
    contact_name: row.contact_name != null ? String(row.contact_name) : null,
    contact_phone: row.contact_phone != null ? String(row.contact_phone) : null,
    country: String(row.country ?? "CL"),
    status: row.status as CompanyRow["status"],
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function inferClassificationWithoutFlag(company: CompanyRow): AuditClassification {
  const email = normalizeAuditEmail(company.billing_email);
  if (PROTECTED_CLIENT_EMAILS.has(email)) return "PROD_REAL";
  if (
    emailLooksQa(email) ||
    QA_EMAIL_DOMAIN_RE.test(email) ||
    companyNameLooksQa(company.name) ||
    companyNameLooksQa(company.legal_name) ||
    QA_NAME_PREFIX_RE.test(String(company.name ?? ""))
  ) {
    return "QA_TEST";
  }
  if (/@telvoice\.cl$/i.test(email)) return "PROD_INTERNAL";
  return "REVIEW_REQUIRED";
}

function buildAuditInfo(
  company: CompanyRow,
  flag: {
    classification: string;
    protected: boolean;
    reason: string | null;
    archivedAt?: string | null;
  } | null,
): AdminClientAuditInfo {
  const billingEmail = normalizeAuditEmail(company.billing_email);
  const protectedFlag =
    Boolean(flag?.protected) || PROTECTED_CLIENT_EMAILS.has(billingEmail);
  const archivedAt = flag?.archivedAt ?? null;

  if (flag?.classification) {
    return {
      classification: flag.classification as AuditClassification,
      protected: protectedFlag,
      reason: flag.reason,
      hasFlag: true,
      archivedAt,
    };
  }

  const inferred = inferClassificationWithoutFlag(company);
  return {
    classification: protectedFlag ? "PROD_REAL" : inferred,
    protected: protectedFlag,
    reason: flag?.reason ?? "Sin flag de auditoría",
    hasFlag: false,
    archivedAt,
  };
}

function companyLooksExcludedFromReal(
  company: CompanyRow,
  audit: AdminClientAuditInfo,
  signals: CompanyRealSignals,
): boolean {
  const email = normalizeAuditEmail(company.billing_email);
  if (PROTECTED_CLIENT_EMAILS.has(email)) return false;
  if (isExplicitProdRealAudit(audit)) return false;
  if (QA_EMAIL_DOMAIN_RE.test(email)) return true;
  if (companyHasStrongRealSignals(company, audit, signals)) return false;
  if (companyHasObviousQaHeuristics(company)) return true;
  if (
    audit.protected &&
    (audit.classification === "QA_TEST" || audit.classification === "DEMO_SEED")
  ) {
    return true;
  }
  if (audit.protected) return false;
  return classificationIsNonReal(audit.classification);
}

function classificationIsNonReal(classification: AuditClassification): boolean {
  return (
    classification === "QA_TEST" ||
    classification === "DEMO_SEED" ||
    classification === "ORPHAN" ||
    classification === "REVIEW_REQUIRED"
  );
}

function matchesScope(
  company: CompanyRow,
  audit: AdminClientAuditInfo,
  scope: AdminClientScope,
  signals: CompanyRealSignals,
): boolean {
  const { classification, protected: protectedFlag } = audit;

  switch (scope) {
    case "real":
      if (companyLooksExcludedFromReal(company, audit, signals)) return false;
      return (
        companyHasStrongRealSignals(company, audit, signals) ||
        protectedFlag ||
        classification === "PROD_REAL"
      );
    case "internal":
      return classification === "PROD_INTERNAL";
    case "qa":
      if (isExplicitProdRealAudit(audit)) return false;
      if (classification === "QA_TEST" || classification === "DEMO_SEED") return true;
      return companyHasObviousQaHeuristics(company);
    case "review":
      return classification === "REVIEW_REQUIRED" || classification === "ORPHAN";
    case "all":
      return true;
    default:
      return false;
  }
}

function matchesSearch(company: CompanyRow, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    company.name,
    company.legal_name,
    company.billing_email,
    company.contact_name,
    company.contact_phone,
    company.rut,
    company.id,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (haystack.includes(q)) return true;
  if (q.includes("@") && normalizeAuditEmail(company.billing_email) === q) return true;
  return false;
}

const CLIENT_SCOPE_LABELS: Record<AdminClientScope, string> = {
  real: "Producción real",
  internal: "Interno Telvoice",
  qa: "QA/Test",
  review: "Revisión requerida",
  all: "Todos",
};

function resolvePrimaryScopeLabel(
  item: AdminClientListItem,
  signals: CompanyRealSignals,
): string {
  const scopes: AdminClientScope[] = ["real", "internal", "qa", "review"];
  for (const scope of scopes) {
    if (matchesScope(item.company, item.audit, scope, signals)) {
      return CLIENT_SCOPE_LABELS[scope];
    }
  }
  return CLIENT_SCOPE_LABELS.all;
}

function detectDuplicateHint(items: AdminClientListItem[]): string | null {
  const byEmail = new Map<string, number>();
  const byName = new Map<string, number>();
  for (const item of items) {
    const email = normalizeAuditEmail(item.company.billing_email);
    if (email) byEmail.set(email, (byEmail.get(email) ?? 0) + 1);
    const name = String(item.company.name ?? "").trim().toLowerCase();
    if (name) byName.set(name, (byName.get(name) ?? 0) + 1);
  }
  const dupEmails = [...byEmail.entries()].filter(([, n]) => n > 1).length;
  const dupNames = [...byName.entries()].filter(([, n]) => n > 1).length;
  if (dupEmails > 0 || dupNames > 0) {
    return "Hay posibles duplicados asociados a este correo o nombre. Revisa la auditoría de datos antes de consolidar.";
  }
  return null;
}

function matchesStatusFilter(
  item: AdminClientListItem,
  statusFilter: AdminClientStatusFilter,
): boolean {
  if (!statusFilter) return true;
  const { company, operational } = item;
  const flags = operational.operationalFlags;

  switch (statusFilter) {
    case "active":
      return company.status === "active";
    case "suspended":
      return company.status === "suspended";
    case "no_balance":
      return !flags.hasBalance;
    case "has_balance":
      return flags.hasBalance;
    case "no_rate_plan":
      return !flags.hasRatePlan;
    case "activity_today":
      return operational.usage.smsToday > 0;
    case "no_activity":
      return flags.noActivity;
    case "protected":
      return flags.isProtected;
    default:
      return true;
  }
}

function computeSegmentCounts(
  all: AdminClientListItem[],
  scope: AdminClientScope,
  signals: CompanyRealSignals,
): AdminClientsScopeSummary["segments"] {
  let productionReal = 0;
  let qaTest = 0;
  let reviewRequired = 0;
  let noBalance = 0;
  let hasBalance = 0;
  let noRatePlan = 0;
  let activityToday = 0;
  let noActivity = 0;
  let protectedCount = 0;

  const scopedForStatus =
    scope === "all"
      ? all
      : all.filter((item) => matchesScope(item.company, item.audit, scope, signals));

  for (const item of all) {
    if (matchesScope(item.company, item.audit, "real", signals)) productionReal += 1;
    if (matchesScope(item.company, item.audit, "qa", signals)) qaTest += 1;
    if (matchesScope(item.company, item.audit, "review", signals)) reviewRequired += 1;
  }

  for (const item of scopedForStatus) {
    const flags = item.operational.operationalFlags;
    if (!flags.hasBalance) noBalance += 1;
    if (flags.hasBalance) hasBalance += 1;
    if (!flags.hasRatePlan) noRatePlan += 1;
    if (item.operational.usage.smsToday > 0) activityToday += 1;
    if (flags.noActivity) noActivity += 1;
    if (flags.isProtected) protectedCount += 1;
  }

  return {
    productionReal,
    qaTest,
    reviewRequired,
    noBalance,
    hasBalance,
    noRatePlan,
    activityToday,
    noActivity,
    protected: protectedCount,
  };
}

function computeSummary(
  all: AdminClientListItem[],
  scoped: AdminClientListItem[],
  visible: AdminClientListItem[],
  scope: AdminClientScope,
  signals: CompanyRealSignals,
): AdminClientsScopeSummary {
  return {
    scope,
    visible: visible.length,
    environmentTotal: scoped.length,
    totalCompanies: all.length,
    segments: computeSegmentCounts(all, scope, signals),
  };
}

function searchLooksQa(search: string): boolean {
  return /\bqa\b|telvoice\.test|example\.invalid|demo|prueba/i.test(search);
}

function parsePage(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export async function listAdminClientsForScope(input: {
  scope?: unknown;
  search?: unknown;
  status?: unknown;
  page?: unknown;
  pageSize?: unknown;
}): Promise<AdminClientsListResult> {
  const scope = parseAdminClientScope(input.scope);
  const search = typeof input.search === "string" ? input.search.trim() : "";
  const statusFilter = parseAdminClientStatusFilter(input.status);
  const page = parsePage(input.page);
  const pageSize = Math.min(
    200,
    Math.max(1, Number(input.pageSize) || DEFAULT_PAGE_SIZE),
  );

  const client = createPgClient();
  await client.connect();
  let rows: Record<string, unknown>[];
  let signals: CompanyRealSignals;
  let opMaps: OperationalMaps;
  try {
    const result = await client.query(`
      SELECT
        c.id, c.name, c.legal_name, c.rut, c.billing_email, c.contact_name,
        c.contact_phone, c.country, c.status, c.metadata, c.created_at, c.updated_at,
        f.classification AS audit_classification,
        f.protected AS audit_protected,
        f.reason AS audit_reason,
        f.archived_at::text AS audit_archived_at
      FROM companies c
      LEFT JOIN admin_data_audit_flags f
        ON f.entity_type = 'company' AND f.entity_id = c.id::text
      ORDER BY c.created_at DESC
    `);
    rows = result.rows;
    [signals, opMaps] = await Promise.all([
      loadCompanyRealSignals(client),
      loadOperationalMaps(client),
    ]);
  } finally {
    await client.end();
  }

  const all: AdminClientListItem[] = rows.map((row) => {
    const company = rowToCompany(row);
    const flag =
      row.audit_classification != null
        ? {
            classification: String(row.audit_classification),
            protected: Boolean(row.audit_protected),
            reason: row.audit_reason != null ? String(row.audit_reason) : null,
            archivedAt:
              row.audit_archived_at != null ? String(row.audit_archived_at) : null,
          }
        : row.audit_archived_at != null
          ? {
              classification: "QA_TEST",
              protected: false,
              reason: null,
              archivedAt: String(row.audit_archived_at),
            }
          : null;
    const audit = buildAuditInfo(company, flag);
    const operational = buildOperationalItem(company, audit, opMaps);
    return { company, audit, operational };
  });

  const notArchived = all.filter((item) => !item.audit.archivedAt);

  const globalSearch = search.length > 0;
  const scoped = notArchived.filter((item) =>
    matchesScope(item.company, item.audit, scope, signals),
  );
  const searchBase = globalSearch ? notArchived : scoped;
  const searched = searchBase.filter((item) => matchesSearch(item.company, search));
  const filtered = searched.filter((item) => matchesStatusFilter(item, statusFilter));
  const totalFiltered = filtered.length;
  const offset = (page - 1) * pageSize;
  const items = filtered.slice(offset, offset + pageSize).map((item) => {
    const inActiveScope = matchesScope(item.company, item.audit, scope, signals);
    return {
      ...item,
      outsideActiveScope: globalSearch && !inActiveScope,
      scopeLabel: resolvePrimaryScopeLabel(item, signals),
    };
  });

  let searchHint: string | null = null;
  if (globalSearch) {
    searchHint = `Resultados globales para: ${search}`;
  } else if (search && items.length === 0 && scope === "real" && searchLooksQa(search)) {
    const qaHits = notArchived.filter(
      (item) =>
        matchesScope(item.company, item.audit, "qa", signals) &&
        matchesSearch(item.company, search),
    ).length;
    if (qaHits > 0) {
      searchHint = `Hay ${qaHits} coincidencia(s) en QA/Test. Cambia el filtro de ambiente para verlas.`;
    }
  }

  let filterEmptyHint: string | null = null;
  if (totalFiltered === 0 && scoped.length > 0 && (statusFilter || search) && !globalSearch) {
    filterEmptyHint = "No hay clientes que coincidan con el filtro actual.";
  } else if (
    totalFiltered === 0 &&
    scoped.length === 0 &&
    scope !== "all" &&
    notArchived.length > 0 &&
    !globalSearch
  ) {
    filterEmptyHint = "Hay clientes en otros segmentos. Cambia el filtro para verlos.";
  } else if (globalSearch && totalFiltered === 0) {
    filterEmptyHint = "No hay clientes que coincidan con la búsqueda.";
  }

  const duplicateHint = globalSearch ? detectDuplicateHint(searched) : null;

  return {
    items,
    summary: computeSummary(notArchived, scoped, filtered, scope, signals),
    search,
    statusFilter,
    searchHint,
    filterEmptyHint,
    globalSearch,
    duplicateHint,
    page,
    pageSize,
    totalFiltered,
  };
}

export async function getAdminClientOperationalDetail(
  companyId: string,
): Promise<AdminClientOperationalDetail | null> {
  const client = createPgClient();
  await client.connect();
  try {
    const companyRes = await client.query(
      `
      SELECT
        c.id, c.name, c.legal_name, c.rut, c.billing_email, c.contact_name,
        c.contact_phone, c.country, c.status, c.metadata, c.created_at, c.updated_at,
        f.classification AS audit_classification,
        f.protected AS audit_protected,
        f.reason AS audit_reason,
        f.archived_at::text AS audit_archived_at
      FROM companies c
      LEFT JOIN admin_data_audit_flags f
        ON f.entity_type = 'company' AND f.entity_id = c.id::text
      WHERE c.id = $1::uuid
      `,
      [companyId],
    );
    if (companyRes.rows.length === 0) return null;

    const row = companyRes.rows[0]!;
    const company = rowToCompany(row);
    const flag =
      row.audit_classification != null
        ? {
            classification: String(row.audit_classification),
            protected: Boolean(row.audit_protected),
            reason: row.audit_reason != null ? String(row.audit_reason) : null,
            archivedAt:
              row.audit_archived_at != null ? String(row.audit_archived_at) : null,
          }
        : row.audit_archived_at != null
          ? {
              classification: "QA_TEST",
              protected: false,
              reason: null,
              archivedAt: String(row.audit_archived_at),
            }
          : null;
    const audit = buildAuditInfo(company, flag);

    const tz = APP_SCHEDULE_TIMEZONE;
    const [signals, opMaps, ordersRes, pendingOrdersRes, invoicesRes, messagesRes, failedRes, emailsRes, walletTxRes, apiKeysRes, webhookRes, usageStatsRes] =
      await Promise.all([
        loadCompanyRealSignals(client),
        loadOperationalMaps(client),
        client.query(
          `
          SELECT id, payment_status, credit_status, sms_quantity, amount, created_at
          FROM sms_orders
          WHERE company_id = $1::uuid
          ORDER BY created_at DESC
          LIMIT 10
          `,
          [companyId],
        ),
        client.query(
          `
          SELECT id, payment_status, credit_status, sms_quantity, amount, created_at
          FROM sms_orders
          WHERE company_id = $1::uuid
            AND payment_status = 'paid'
            AND credit_status IS DISTINCT FROM 'credited'
          ORDER BY created_at DESC
          LIMIT 10
          `,
          [companyId],
        ),
        client.query(
          `
          SELECT id, invoice_number, status, payment_status, total_amount, issued_at
          FROM billing_invoices
          WHERE company_id = $1::uuid
          ORDER BY created_at DESC
          LIMIT 10
          `,
          [companyId],
        ),
        client.query(
          `
          SELECT id, recipient_number, message, status, mode, sent_at, created_at
          FROM panel_sms_messages
          WHERE company_id = $1::uuid
          ORDER BY created_at DESC
          LIMIT 10
          `,
          [companyId],
        ),
        client.query(
          `
          SELECT id, recipient_number, message, status, mode, sent_at, created_at
          FROM panel_sms_messages
          WHERE company_id = $1::uuid
            AND status IN ('failed', 'rejected')
          ORDER BY created_at DESC
          LIMIT 10
          `,
          [companyId],
        ),
        client.query(
          `
          (
            SELECT id, email_type AS kind, to_email, subject, status, sent_at
            FROM billing_email_logs
            WHERE company_id = $1::uuid
          )
          UNION ALL
          (
            SELECT id, template_key AS kind, recipient_email AS to_email, subject, status, sent_at
            FROM email_logs
            WHERE company_id = $1::uuid
          )
          ORDER BY sent_at DESC NULLS LAST
          LIMIT 15
          `,
          [companyId],
        ),
        client.query(
          `
          SELECT id, type, sms_amount, balance_after, description, created_at
          FROM wallet_transactions
          WHERE company_id = $1::uuid
          ORDER BY created_at DESC
          LIMIT 10
          `,
          [companyId],
        ),
        client.query(
          `
          SELECT id, label, environment, status, last_used_at
          FROM client_api_keys
          WHERE company_id = $1::uuid
          ORDER BY updated_at DESC
          LIMIT 10
          `,
          [companyId],
        ).catch(() => ({ rows: [] as Record<string, unknown>[] })),
        client.query(
          `
          SELECT webhook_url, webhook_status
          FROM client_api_settings
          WHERE company_id = $1::uuid
          LIMIT 1
          `,
          [companyId],
        ).catch(() => ({ rows: [] as Record<string, unknown>[] })),
        client.query(
          `
          SELECT
            COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
            COUNT(*) FILTER (WHERE status IN ('failed', 'rejected'))::int AS failed
          FROM panel_sms_messages
          WHERE company_id = $1::uuid
            AND mode IN ('live', 'live_test')
            AND status = ANY($2::text[])
            AND created_at >= date_trunc('month', now() AT TIME ZONE $3)
          `,
          [companyId, COUNTABLE_MSG_STATUSES, tz],
        ),
      ]);

    void signals;
    const operational = buildOperationalItem(company, audit, opMaps);
    const rp = opMaps.ratePlans.get(companyId);

    const recentOrders: AdminClientDetailRecentOrder[] = ordersRes.rows.map((o) => ({
      id: String(o.id),
      paymentStatus: String(o.payment_status ?? ""),
      creditStatus: String(o.credit_status ?? ""),
      smsQuantity: Number(o.sms_quantity ?? 0),
      amount: String(o.amount ?? "0"),
      createdAt: String(o.created_at ?? ""),
    }));

    const recentInvoices: AdminClientDetailRecentInvoice[] = invoicesRes.rows.map((i) => ({
      id: String(i.id),
      invoiceNumber: String(i.invoice_number ?? ""),
      status: String(i.status ?? ""),
      paymentStatus: String(i.payment_status ?? ""),
      totalAmount: Number(i.total_amount ?? 0),
      issuedAt: i.issued_at != null ? String(i.issued_at) : null,
    }));

    const recentMessages: AdminClientDetailRecentMessage[] = messagesRes.rows.map((m) => ({
      id: String(m.id),
      recipientNumber: String(m.recipient_number ?? ""),
      messageBody: String(m.message ?? ""),
      status: String(m.status ?? ""),
      mode: String(m.mode ?? ""),
      sentAt: m.sent_at != null ? String(m.sent_at) : null,
      createdAt: String(m.created_at ?? ""),
    }));

    const recentEmails: AdminClientDetailRecentEmail[] = emailsRes.rows.map((e) => ({
      id: String(e.id),
      kind: String(e.kind ?? ""),
      toEmail: String(e.to_email ?? ""),
      subject: String(e.subject ?? ""),
      status: String(e.status ?? ""),
      sentAt: e.sent_at != null ? String(e.sent_at) : null,
    }));

    const apiKeys: AdminClientDetailApiKey[] = apiKeysRes.rows.map((k) => ({
      id: String(k.id),
      label: String(k.label ?? "—"),
      environment: String(k.environment ?? ""),
      status: String(k.status ?? ""),
      lastUsedAt: k.last_used_at != null ? String(k.last_used_at) : null,
    }));

    const pendingOrders: AdminClientDetailRecentOrder[] = pendingOrdersRes.rows.map(
      (o) => ({
        id: String(o.id),
        paymentStatus: String(o.payment_status ?? ""),
        creditStatus: String(o.credit_status ?? ""),
        smsQuantity: Number(o.sms_quantity ?? 0),
        amount: String(o.amount ?? "0"),
        createdAt: String(o.created_at ?? ""),
      }),
    );

    const recentFailedMessages: AdminClientDetailRecentMessage[] = failedRes.rows.map(
      (m) => ({
        id: String(m.id),
        recipientNumber: String(m.recipient_number ?? ""),
        messageBody: String(m.message ?? ""),
        status: String(m.status ?? ""),
        mode: String(m.mode ?? ""),
        sentAt: m.sent_at != null ? String(m.sent_at) : null,
        createdAt: String(m.created_at ?? ""),
      }),
    );

    const recentWalletTransactions: AdminClientDetailWalletTransaction[] =
      walletTxRes.rows.map((t) => ({
        id: String(t.id),
        type: String(t.type ?? ""),
        smsAmount: Number(t.sms_amount ?? 0),
        balanceAfter: Number(t.balance_after ?? 0),
        description: t.description != null ? String(t.description) : null,
        createdAt: String(t.created_at ?? ""),
      }));

    const webhookRow = webhookRes.rows[0];
    const webhook: AdminClientDetailWebhook | null = webhookRow
      ? {
          url:
            webhookRow.webhook_url != null ? String(webhookRow.webhook_url) : null,
          status:
            webhookRow.webhook_status != null
              ? String(webhookRow.webhook_status)
              : null,
        }
      : null;

    const statsRow = usageStatsRes.rows[0];
    const deliveredMonth = Number(statsRow?.delivered ?? 0);
    const failedMonth = Number(statsRow?.failed ?? 0);
    const totalMonth = deliveredMonth + failedMonth;
    const deliveryRate =
      totalMonth > 0
        ? `${((deliveredMonth / totalMonth) * 100).toFixed(1).replace(".", ",")}%`
        : null;

    return {
      company,
      audit,
      operational,
      ratePlanLiveEnabled: rp?.live_enabled ?? null,
      ratePlanCampaignsEnabled: rp?.campaigns_enabled ?? null,
      ratePlanApiEnabled: rp?.api_enabled ?? null,
      recentOrders,
      pendingOrders,
      recentInvoices,
      recentMessages,
      recentFailedMessages,
      recentEmails,
      recentWalletTransactions,
      apiKeys,
      webhook,
      usageStats: {
        deliveredMonth,
        failedMonth,
        deliveryRate,
      },
    };
  } finally {
    await client.end();
  }
}
