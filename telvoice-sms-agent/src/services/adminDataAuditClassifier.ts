import type { AuditClassification } from "../types/adminDataAudit.js";
import { getOrderBillingRecoveryMeta } from "./billingRecoveryService.js";
import { TEST_CLIENT_COMPANY, TEST_CLIENT_EMAIL } from "./clientService.js";

/** Emails de clientes reales que nunca deben clasificarse como QA/demo. */
export const PROTECTED_CLIENT_EMAILS = new Set([
  "arturo.aguilar@talkchile.cl",
]);

/** Empresas conocidas como QA interno (además de las descubiertas por email). */
export const KNOWN_QA_EMAILS = new Set([
  TEST_CLIENT_EMAIL,
  "prueba@telvoice.cl",
  "licantravel@gmail.com",
]);

const DEMO_ORDER_IDS = new Set([
  "a234b253-e949-4866-9e74-9ce99c9de9c4",
  "3a132bfd-5bd4-4283-a0c8-07f23588952a",
  "961de5a4-3c60-4b67-9118-a778121f8c05",
  "991aa4cb-e448-4c32-a5c5-6dcde7eb3d9d",
]);

const QA_TEXT_RE =
  /\b(qa|test|prueba|demo|seed|sandbox|staging|fake|dummy|ejemplo)\b/i;
const INTERNAL_EMAIL_RE = /@telvoice\.cl$/i;

export type AuditProtectionContext = {
  protectedCompanyIds: Set<string>;
  protectedOrderIds: Set<string>;
  companiesWithLiveSends: Set<string>;
  companiesWithPaidOrders: Set<string>;
  orphanCompanyIds: Set<string>;
};

export function normalizeAuditEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function emailLooksQa(email: string): boolean {
  const e = normalizeAuditEmail(email);
  if (!e) return false;
  if (PROTECTED_CLIENT_EMAILS.has(e)) return false;
  if (KNOWN_QA_EMAILS.has(e)) return true;
  if (INTERNAL_EMAIL_RE.test(e)) return true;
  if (/\+qa@|qa\+|test\+|\+test@/i.test(e)) return true;
  return QA_TEXT_RE.test(e);
}

export function textLooksQa(value: unknown): boolean {
  return typeof value === "string" && QA_TEXT_RE.test(value);
}

export function companyNameLooksQa(name: unknown): boolean {
  if (typeof name !== "string") return false;
  if (name === TEST_CLIENT_COMPANY) return true;
  return QA_TEXT_RE.test(name);
}

export function orderHasRealPayment(row: Record<string, unknown>): boolean {
  const meta =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {};
  const paymentStatus = String(row.payment_status ?? "");
  const creditStatus = String(row.credit_status ?? "");
  if (paymentStatus === "paid" || creditStatus === "credited") return true;
  if (row.payment_reference) return true;
  if (meta.mercado_pago_payment_id) return true;
  if (meta.mercadopago_payment_id) return true;
  if (meta.external_reference) return true;
  if (meta.payment_provider_id) return true;
  return false;
}

export function orderLooksQa(row: Record<string, unknown>): boolean {
  if (DEMO_ORDER_IDS.has(String(row.id ?? ""))) return true;
  const br = getOrderBillingRecoveryMeta(
    row.metadata as Record<string, unknown> | null,
  );
  if (br?.excluded && br.reason === "demo_qa_order") return true;
  const emails = [
    normalizeAuditEmail(row.checkout_email),
    normalizeAuditEmail(row.payer_email),
  ].filter(Boolean);
  if (emails.some((e) => emailLooksQa(e))) return true;
  const meta =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {};
  if (meta.demo === true || meta.is_demo === true || meta.qa === true) {
    return true;
  }
  if (textLooksQa(String(meta.source ?? ""))) return true;
  return false;
}

export function classifyResult(
  classification: AuditClassification,
  reason: string,
  confidence: number,
  protectedFlag: boolean,
): { classification: AuditClassification; reason: string; confidence: number; protected: boolean } {
  return {
    classification,
    reason,
    confidence: Math.min(1, Math.max(0, confidence)),
    protected: protectedFlag,
  };
}

export function classifyCompany(
  row: Record<string, unknown>,
  ctx: AuditProtectionContext,
): ReturnType<typeof classifyResult> {
  const id = String(row.id ?? "");
  const billingEmail = normalizeAuditEmail(row.billing_email);

  if (ctx.protectedCompanyIds.has(id)) {
    return classifyResult("PROD_REAL", "Empresa protegida (cliente real)", 1, true);
  }
  if (PROTECTED_CLIENT_EMAILS.has(billingEmail)) {
    return classifyResult("PROD_REAL", "Email cliente real protegido", 1, true);
  }
  if (ctx.companiesWithLiveSends.has(id)) {
    return classifyResult("PROD_REAL", "Empresa con envíos SMS live", 0.98, true);
  }
  if (ctx.companiesWithPaidOrders.has(id)) {
    return classifyResult("PROD_REAL", "Empresa con órdenes pagadas/acreditadas", 0.95, true);
  }
  if (
    emailLooksQa(billingEmail) ||
    companyNameLooksQa(row.name) ||
    companyNameLooksQa(row.legal_name)
  ) {
    return classifyResult("QA_TEST", "Nombre o email de prueba/QA", 0.92, false);
  }
  const meta =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {};
  if (meta.demo === true || meta.seed === true) {
    return classifyResult("DEMO_SEED", "metadata.demo/seed", 0.95, false);
  }
  if (INTERNAL_EMAIL_RE.test(billingEmail)) {
    return classifyResult("PROD_INTERNAL", "Email interno Telvoice", 0.9, true);
  }
  return classifyResult("REVIEW_REQUIRED", "Empresa sin señales claras QA/real", 0.45, false);
}

export function classifyOrder(
  row: Record<string, unknown>,
  ctx: AuditProtectionContext,
): ReturnType<typeof classifyResult> {
  const id = String(row.id ?? "");
  const companyId = String(row.company_id ?? "");

  if (ctx.protectedOrderIds.has(id)) {
    return classifyResult("PROD_REAL", "Orden protegida (cliente real)", 1, true);
  }
  if (ctx.protectedCompanyIds.has(companyId)) {
    return classifyResult("PROD_REAL", "Orden de empresa protegida", 1, true);
  }
  const emails = [
    normalizeAuditEmail(row.checkout_email),
    normalizeAuditEmail(row.payer_email),
  ].filter(Boolean);
  if (emails.some((e) => PROTECTED_CLIENT_EMAILS.has(e))) {
    return classifyResult("PROD_REAL", "Orden de email cliente real", 1, true);
  }
  if (orderLooksQa(row)) {
    const hasPay = orderHasRealPayment(row);
    return classifyResult(
      "QA_TEST",
      hasPay ? "Orden QA con pago (revisar manual)" : "Orden QA/demo",
      hasPay ? 0.7 : 0.95,
      hasPay,
    );
  }
  if (orderHasRealPayment(row)) {
    return classifyResult("PROD_REAL", "Orden con pago/crédito real", 0.96, true);
  }
  if (!companyId) {
    return classifyResult("ORPHAN", "Orden sin company_id", 0.85, false);
  }
  return classifyResult("REVIEW_REQUIRED", "Orden sin clasificación automática", 0.4, false);
}

export function classifyByCompanyLink(
  companyId: string | null | undefined,
  ctx: AuditProtectionContext,
  opts?: { mode?: string; status?: string },
): ReturnType<typeof classifyResult> {
  const cid = companyId ? String(companyId) : "";
  if (ctx.protectedCompanyIds.has(cid)) {
    return classifyResult("PROD_REAL", "Vinculado a empresa protegida", 1, true);
  }
  if (!cid) {
    return classifyResult("ORPHAN", "Sin company_id", 0.9, false);
  }
  if (ctx.companiesWithLiveSends.has(cid)) {
    return classifyResult("PROD_REAL", "Empresa con envíos live", 0.97, true);
  }
  if (opts?.mode === "mock" || opts?.mode === "live_test") {
    return classifyResult("QA_TEST", `mode=${opts.mode}`, 0.93, false);
  }
  if (ctx.orphanCompanyIds.has(cid)) {
    return classifyResult("ORPHAN", "company_id sin empresa", 0.88, false);
  }
  return classifyResult("REVIEW_REQUIRED", "Relación empresa sin señal clara", 0.35, false);
}

export function isCleanupCandidate(classification: AuditClassification): boolean {
  return classification === "QA_TEST" || classification === "DEMO_SEED" || classification === "ORPHAN";
}
