import { createPgClient } from "../database/pgClient.js";
import type { AuditClassification } from "../types/adminDataAudit.js";
import type {
  AdminClientAuditInfo,
  AdminClientListItem,
  AdminClientScope,
  AdminClientsListResult,
  AdminClientsScopeSummary,
} from "../types/adminClientsList.js";
import type { CompanyRow } from "../types/tenant.js";
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

type CompanyRealSignals = {
  realPaidOrders: Set<string>;
  walletCredit: Set<string>;
  liveSms: Set<string>;
};

async function loadCompanyRealSignals(client: {
  query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }>;
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

function companyHasObviousQaHeuristics(company: CompanyRow): boolean {
  const email = normalizeAuditEmail(company.billing_email);
  if (PROTECTED_CLIENT_EMAILS.has(email)) return false;
  if (QA_EMAIL_DOMAIN_RE.test(email)) return true;
  if (QA_NAME_PREFIX_RE.test(String(company.name ?? ""))) return true;
  if (companyNameLooksQa(company.name) || companyNameLooksQa(company.legal_name)) return true;
  if (emailLooksQa(email)) return true;
  return false;
}

function companyHasStrongRealSignals(
  company: CompanyRow,
  audit: AdminClientAuditInfo,
  signals: CompanyRealSignals,
): boolean {
  const email = normalizeAuditEmail(company.billing_email);
  if (PROTECTED_CLIENT_EMAILS.has(email)) return true;

  // Nombre/email QA de prueba no se promueve por wallet/SMS/órdenes de test internas.
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
  flag: { classification: string; protected: boolean; reason: string | null } | null,
): AdminClientAuditInfo {
  const billingEmail = normalizeAuditEmail(company.billing_email);
  const protectedFlag =
    Boolean(flag?.protected) || PROTECTED_CLIENT_EMAILS.has(billingEmail);

  if (flag?.classification) {
    return {
      classification: flag.classification as AuditClassification,
      protected: protectedFlag,
      reason: flag.reason,
      hasFlag: true,
    };
  }

  const inferred = inferClassificationWithoutFlag(company);
  return {
    classification: protectedFlag ? "PROD_REAL" : inferred,
    protected: protectedFlag,
    reason: flag?.reason ?? "Sin flag de auditoría",
    hasFlag: false,
  };
}

function companyLooksExcludedFromReal(
  company: CompanyRow,
  audit: AdminClientAuditInfo,
  signals: CompanyRealSignals,
): boolean {
  const email = normalizeAuditEmail(company.billing_email);
  if (PROTECTED_CLIENT_EMAILS.has(email)) return false;

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
    company.rut,
    company.id,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function computeSummary(
  all: AdminClientListItem[],
  visible: AdminClientListItem[],
  scope: AdminClientScope,
  signals: CompanyRealSignals,
): AdminClientsScopeSummary {
  const hiddenQa = all.filter((i) => matchesScope(i.company, i.audit, "qa", signals)).length;
  const reviewRequired = all.filter((i) =>
    matchesScope(i.company, i.audit, "review", signals),
  ).length;

  const protectedTotal = all.filter((i) => i.audit.protected).length;

  return {
    scope,
    visible: visible.length,
    hiddenQa,
    reviewRequired,
    protectedVisible: protectedTotal,
    totalCompanies: all.length,
  };
}

function searchLooksQa(search: string): boolean {
  return /\bqa\b|telvoice\.test|example\.invalid|demo|prueba/i.test(search);
}

export async function listAdminClientsForScope(input: {
  scope?: unknown;
  search?: unknown;
}): Promise<AdminClientsListResult> {
  const scope = parseAdminClientScope(input.scope);
  const search = typeof input.search === "string" ? input.search.trim() : "";

  const client = createPgClient();
  await client.connect();
  let rows: Record<string, unknown>[];
  let signals: CompanyRealSignals;
  try {
    const result = await client.query(`
      SELECT
        c.id, c.name, c.legal_name, c.rut, c.billing_email, c.contact_name,
        c.contact_phone, c.country, c.status, c.metadata, c.created_at, c.updated_at,
        f.classification AS audit_classification,
        f.protected AS audit_protected,
        f.reason AS audit_reason
      FROM companies c
      LEFT JOIN admin_data_audit_flags f
        ON f.entity_type = 'company' AND f.entity_id = c.id::text
      ORDER BY c.created_at DESC
    `);
    rows = result.rows;
    signals = await loadCompanyRealSignals(client);
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
          }
        : null;
    return { company, audit: buildAuditInfo(company, flag) };
  });

  const scoped = all.filter((item) =>
    matchesScope(item.company, item.audit, scope, signals),
  );
  const items = scoped.filter((item) => matchesSearch(item.company, search));

  let searchHint: string | null = null;
  if (search && items.length === 0 && scope === "real" && searchLooksQa(search)) {
    const qaHits = all.filter(
      (item) =>
        matchesScope(item.company, item.audit, "qa", signals) &&
        matchesSearch(item.company, search),
    ).length;
    if (qaHits > 0) {
      searchHint = `Hay ${qaHits} coincidencia(s) en QA/Test. Cambia el filtro de ambiente para verlas.`;
    }
  }

  return {
    items,
    summary: computeSummary(all, items, scope, signals),
    search,
    searchHint,
  };
}
