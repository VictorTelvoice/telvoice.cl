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
  PROTECTED_CLIENT_EMAILS,
} from "./adminDataAuditClassifier.js";

const QA_EMAIL_DOMAIN_RE = /@(telvoice\.test|example\.invalid)$/i;
const QA_NAME_PREFIX_RE = /^qa\s/i;

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

function companyHasObviousQaSignals(company: CompanyRow): boolean {
  const email = normalizeAuditEmail(company.billing_email);
  if (PROTECTED_CLIENT_EMAILS.has(email)) return false;
  if (QA_EMAIL_DOMAIN_RE.test(email)) return true;
  if (QA_NAME_PREFIX_RE.test(String(company.name ?? ""))) return true;
  if (companyNameLooksQa(company.name) || companyNameLooksQa(company.legal_name)) return true;
  if (emailLooksQa(email)) return true;
  return false;
}

function companyLooksExcludedFromReal(
  company: CompanyRow,
  audit: AdminClientAuditInfo,
): boolean {
  if (companyHasObviousQaSignals(company)) return true;

  const email = normalizeAuditEmail(company.billing_email);
  if (PROTECTED_CLIENT_EMAILS.has(email) || audit.protected) return false;

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
): boolean {
  const { classification, protected: protectedFlag } = audit;

  switch (scope) {
    case "real":
      if (companyLooksExcludedFromReal(company, audit)) return false;
      return protectedFlag || classification === "PROD_REAL";
    case "internal":
      return classification === "PROD_INTERNAL";
    case "qa":
      if (classification === "QA_TEST" || classification === "DEMO_SEED") return true;
      return companyHasObviousQaSignals(company);
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
): AdminClientsScopeSummary {
  const hiddenQa = all.filter((i) => matchesScope(i.company, i.audit, "qa")).length;
  const reviewRequired = all.filter((i) =>
    matchesScope(i.company, i.audit, "review"),
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

  const scoped = all.filter((item) => matchesScope(item.company, item.audit, scope));
  const items = scoped.filter((item) => matchesSearch(item.company, search));

  let searchHint: string | null = null;
  if (search && items.length === 0 && scope === "real" && searchLooksQa(search)) {
    const qaHits = all.filter(
      (item) =>
        matchesScope(item.company, item.audit, "qa") &&
        matchesSearch(item.company, search),
    ).length;
    if (qaHits > 0) {
      searchHint = `Hay ${qaHits} coincidencia(s) en QA/Test. Cambia el filtro de ambiente para verlas.`;
    }
  }

  return {
    items,
    summary: computeSummary(all, items, scope),
    search,
    searchHint,
  };
}
