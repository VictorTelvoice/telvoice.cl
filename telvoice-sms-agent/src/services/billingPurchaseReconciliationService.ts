import { getSupabase } from "../database/supabaseClient.js";
import type { AuditClassification } from "../types/adminDataAudit.js";
import type { SmsOrderRow } from "../types/wallet.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import {
  companyNameLooksQa,
  emailLooksQa,
  normalizeAuditEmail,
  orderLooksQa,
} from "./adminDataAuditClassifier.js";
import { isExplicitTestPurchaseEmail } from "./adminProductionScopeService.js";
import {
  confirmOrderCredit,
  getOrderById,
  patchOrderFields,
} from "./smsOrderService.js";
import { getOrCreateCompanyWallet } from "./smsWalletService.js";
import { hasPurchaseCreditForOrder } from "./walletTransactionService.js";

const QA_NAME_PREFIX_RE = /^qa\s/i;
const QA_BLOCKED_CLASSIFICATIONS = new Set<AuditClassification>([
  "QA_TEST",
  "DEMO_SEED",
  "ORPHAN",
]);

export type ReconcileEligibilityStatus =
  | "eligible"
  | "manual_review_blocked"
  | "qa_blocked"
  | "company_conflict"
  | "already_credited"
  | "test_email"
  | "not_paid"
  | "order_not_found"
  | "missing_email"
  | "no_company";

export type PaidUnclaimedPurchaseRow = {
  orderId: string;
  paymentStatus: string;
  creditStatus: string;
  claimStatus: string | null;
  companyId: string | null;
  checkoutEmail: string | null;
  payerEmail: string | null;
  smsQuantity: number;
  amount: number;
  hasWalletCredit: boolean;
  companyName: string | null;
  recommendation: string;
  eligibility: ReconcileEligibilityStatus;
  wouldReconcile: boolean;
  requiresManualOverride: boolean;
  requiresManualReview: boolean;
  resolvedCompanyId: string | null;
};

export type ReconcilePaidPurchaseResult = {
  orderId: string;
  dryRun: boolean;
  action:
    | "skipped"
    | "already_credited"
    | "would_reconcile"
    | "reconciled"
    | "failed";
  status: ReconcileEligibilityStatus;
  wouldReconcile: boolean;
  requiresManualOverride?: boolean;
  requiresManualReview?: boolean;
  reason?: string;
  companyId?: string | null;
  error?: string;
};

export type ReconcilePurchaseOptions = {
  dryRun?: boolean;
  actorUserId?: string | null;
  source?: string;
  forceManualReview?: boolean;
  includeQa?: boolean;
  /** Solo tras validación explícita --resolve-manual-review (no usar como escape genérico). */
  manualReviewResolved?: boolean;
  resolvedCompanyId?: string;
};

function purchaseEmail(order: SmsOrderRow): string {
  return normalizeAuditEmail(order.checkout_email ?? order.payer_email);
}

function logReconcileEvent(
  event:
    | "dry_run"
    | "skipped_manual_review"
    | "skipped_qa"
    | "company_conflict"
    | "credit_applied"
    | "billing_sync_skipped"
    | "manual_review_resolved"
    | "failed",
  payload: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      event: `purchase_reconcile.${event}`,
      at: new Date().toISOString(),
      ...payload,
    }),
  );
}

async function getCompanyAuditClassification(
  companyId: string,
): Promise<AuditClassification | null> {
  const { data, error } = await getSupabase()
    .from("admin_data_audit_flags")
    .select("classification")
    .eq("entity_type", "company")
    .eq("entity_id", companyId)
    .maybeSingle();
  if (error || !data?.classification) return null;
  return data.classification as AuditClassification;
}

async function getCompanyName(companyId: string): Promise<string | null> {
  const { data } = await getSupabase()
    .from("companies")
    .select("name, legal_name, billing_email")
    .eq("id", companyId)
    .maybeSingle();
  if (!data) return null;
  return String(data.name ?? data.legal_name ?? data.billing_email ?? "");
}

async function isQaBlockedOrder(
  order: SmsOrderRow,
  resolvedCompanyId: string | null,
): Promise<boolean> {
  const email = purchaseEmail(order);
  if (isExplicitTestPurchaseEmail(email)) return true;
  if (orderLooksQa(order as unknown as Record<string, unknown>)) return true;
  if (emailLooksQa(email)) return true;

  const meta =
    order.metadata && typeof order.metadata === "object"
      ? (order.metadata as Record<string, unknown>)
      : {};
  if (meta.demo === true || meta.seed === true || meta.qa === true) return true;
  if (typeof meta.source === "string" && /qa|test|demo|seed/i.test(meta.source)) {
    return true;
  }

  const companyIds = [order.company_id, resolvedCompanyId].filter(Boolean) as string[];
  for (const cid of companyIds) {
    const classification = await getCompanyAuditClassification(cid);
    if (classification && QA_BLOCKED_CLASSIFICATIONS.has(classification)) {
      return true;
    }
    const name = await getCompanyName(cid);
    if (name && (QA_NAME_PREFIX_RE.test(name) || companyNameLooksQa(name))) {
      return true;
    }
  }

  return false;
}

export type CompanyCandidate = {
  id: string;
  name: string | null;
  billingEmail: string | null;
  source: "billing_email" | "user_profile";
};

export async function findCompanyCandidatesByEmail(
  email: string,
): Promise<CompanyCandidate[]> {
  if (!email) return [];
  const sb = getSupabase();
  const seen = new Set<string>();
  const candidates: CompanyCandidate[] = [];

  const { data: companies, error: cErr } = await sb
    .from("companies")
    .select("id, name, legal_name, billing_email")
    .ilike("billing_email", email);
  if (cErr) wrapSupabaseError(cErr, "reconcile.findCompanyCandidates");
  for (const row of companies ?? []) {
    const id = String(row.id);
    if (seen.has(id)) continue;
    seen.add(id);
    candidates.push({
      id,
      name: String(row.name ?? row.legal_name ?? ""),
      billingEmail: row.billing_email
        ? normalizeAuditEmail(row.billing_email)
        : null,
      source: "billing_email",
    });
  }

  const { data: profiles, error: pErr } = await sb
    .from("user_profiles")
    .select("company_id, email, full_name")
    .ilike("email", email)
    .not("company_id", "is", null);
  if (pErr) wrapSupabaseError(pErr, "reconcile.findProfileCandidates");
  for (const row of profiles ?? []) {
    const id = String(row.company_id);
    if (seen.has(id)) continue;
    seen.add(id);
    const { data: company } = await sb
      .from("companies")
      .select("name, legal_name, billing_email")
      .eq("id", id)
      .maybeSingle();
    candidates.push({
      id,
      name: String(company?.name ?? company?.legal_name ?? row.full_name ?? ""),
      billingEmail: company?.billing_email
        ? normalizeAuditEmail(company.billing_email)
        : normalizeAuditEmail(row.email),
      source: "user_profile",
    });
  }

  return candidates;
}

async function findCompanyIdByEmail(email: string): Promise<string | null> {
  const candidates = await findCompanyCandidatesByEmail(email);
  return candidates[0]?.id ?? null;
}

async function createCompanyForPaidPurchase(
  email: string,
  order: SmsOrderRow,
): Promise<string> {
  const localPart = email.split("@")[0] || "Cliente";
  const { data, error } = await getSupabase()
    .from("companies")
    .insert({
      name: localPart,
      billing_email: email,
      contact_name: localPart,
      country: "CL",
      status: "active",
      metadata: {
        source: "mercado_pago_purchase",
        order_id: order.id,
        reconciled_at: new Date().toISOString(),
      },
    })
    .select("id")
    .single();
  if (error) wrapSupabaseError(error, "reconcile.createCompany");
  if (!data?.id) {
    throw new AppError("No se pudo crear empresa para la compra.", 500);
  }
  return String(data.id);
}

type PrepareOrderResult =
  | { ok: true }
  | { ok: false; status: "company_conflict" };

function validateCompanyLink(
  order: SmsOrderRow,
  resolvedCompanyId: string,
): PrepareOrderResult {
  if (order.company_id && order.company_id !== resolvedCompanyId) {
    return { ok: false, status: "company_conflict" };
  }
  return { ok: true };
}

async function prepareOrderForCredit(
  orderId: string,
  companyId: string,
): Promise<PrepareOrderResult> {
  const order = await getOrderById(orderId);
  if (!order) return { ok: true };

  const link = validateCompanyLink(order, companyId);
  if (!link.ok) return link;

  const patch: Record<string, unknown> = {};
  if (!order.company_id) {
    patch.company_id = companyId;
  }
  if (
    order.credit_status === "pending_claim" ||
    order.credit_status === "pending"
  ) {
    patch.credit_status = "pending";
  }
  if (Object.keys(patch).length > 0) {
    await patchOrderFields(orderId, patch);
  }
  return { ok: true };
}

async function assessReconcileEligibility(
  order: SmsOrderRow,
  options: ReconcilePurchaseOptions,
): Promise<{
  status: ReconcileEligibilityStatus;
  wouldReconcile: boolean;
  requiresManualOverride: boolean;
  requiresManualReview: boolean;
  resolvedCompanyId: string | null;
  reason?: string;
}> {
  const email = purchaseEmail(order);

  if (order.payment_status !== "paid") {
    return {
      status: "not_paid",
      wouldReconcile: false,
      requiresManualOverride: false,
      requiresManualReview: false,
      resolvedCompanyId: null,
      reason: "not_paid",
    };
  }

  if (isExplicitTestPurchaseEmail(email)) {
    return {
      status: "test_email",
      wouldReconcile: false,
      requiresManualOverride: false,
      requiresManualReview: false,
      resolvedCompanyId: null,
      reason: "test_email",
    };
  }

  if (await hasPurchaseCreditForOrder(order.id)) {
    return {
      status: "already_credited",
      wouldReconcile: false,
      requiresManualOverride: false,
      requiresManualReview: false,
      resolvedCompanyId: order.company_id,
      reason: "already_credited",
    };
  }

  if (
    order.claim_status === "manual_review" &&
    !options.forceManualReview &&
    !options.manualReviewResolved
  ) {
    return {
      status: "manual_review_blocked",
      wouldReconcile: false,
      requiresManualOverride: true,
      requiresManualReview: true,
      resolvedCompanyId: order.company_id,
      reason: "manual_review",
    };
  }

  let resolvedCompanyId =
    options.manualReviewResolved && options.resolvedCompanyId
      ? options.resolvedCompanyId
      : order.company_id;
  if (!resolvedCompanyId && email) {
    resolvedCompanyId = await findCompanyIdByEmail(email);
  }

  if (order.company_id && resolvedCompanyId && order.company_id !== resolvedCompanyId) {
    return {
      status: "company_conflict",
      wouldReconcile: false,
      requiresManualOverride: true,
      requiresManualReview: true,
      resolvedCompanyId,
      reason: "company_id_mismatch",
    };
  }

  if (!options.includeQa && (await isQaBlockedOrder(order, resolvedCompanyId))) {
    return {
      status: "qa_blocked",
      wouldReconcile: false,
      requiresManualOverride: true,
      requiresManualReview: true,
      resolvedCompanyId,
      reason: "qa_or_test_order",
    };
  }

  if (!resolvedCompanyId && !email) {
    return {
      status: "missing_email",
      wouldReconcile: false,
      requiresManualOverride: false,
      requiresManualReview: false,
      resolvedCompanyId: null,
      reason: "missing_email",
    };
  }

  return {
    status: "eligible",
    wouldReconcile: true,
    requiresManualOverride: false,
    requiresManualReview: false,
    resolvedCompanyId,
  };
}

export async function listPaidUnclaimedPurchases(): Promise<
  PaidUnclaimedPurchaseRow[]
> {
  const { data: orders, error } = await getSupabase()
    .from("sms_orders")
    .select(
      "id, payment_status, credit_status, claim_status, company_id, checkout_email, payer_email, sms_quantity, amount, metadata",
    )
    .eq("payment_status", "paid")
    .in("credit_status", ["pending", "pending_claim"])
    .order("created_at", { ascending: false });

  if (error) wrapSupabaseError(error, "listPaidUnclaimedPurchases");

  const rows: PaidUnclaimedPurchaseRow[] = [];
  for (const raw of orders ?? []) {
    const order = raw as SmsOrderRow;
    const hasCredit = await hasPurchaseCreditForOrder(order.id);
    if (hasCredit) continue;

    const assessment = await assessReconcileEligibility(order, {
      dryRun: true,
    });

    let companyName: string | null = null;
    const companyRef = order.company_id ?? assessment.resolvedCompanyId;
    if (companyRef) {
      companyName = await getCompanyName(companyRef);
    }

    let recommendation = "Acreditar saldo y vincular empresa por email.";
    if (assessment.status === "manual_review_blocked") {
      recommendation =
        "Bloqueado: claim en manual_review. Requiere --force-manual-review.";
    } else if (assessment.status === "qa_blocked") {
      recommendation =
        "Bloqueado: orden/empresa QA o test. Requiere --include-qa para override.";
    } else if (assessment.status === "company_conflict") {
      recommendation =
        "Bloqueado: company_id de la orden no coincide con empresa resuelta por email.";
    } else if (!order.company_id && assessment.status === "eligible") {
      recommendation = "Crear o vincular empresa por email y acreditar saldo.";
    } else if (order.credit_status === "pending_claim") {
      recommendation =
        "Orden pagada con empresa existente; acreditar sin esperar claim.";
    }

    rows.push({
      orderId: order.id,
      paymentStatus: order.payment_status,
      creditStatus: order.credit_status,
      claimStatus: order.claim_status ?? null,
      companyId: order.company_id,
      checkoutEmail: order.checkout_email ?? null,
      payerEmail: order.payer_email ?? null,
      smsQuantity: order.sms_quantity,
      amount: order.amount,
      hasWalletCredit: hasCredit,
      companyName,
      recommendation,
      eligibility: assessment.status,
      wouldReconcile: assessment.wouldReconcile,
      requiresManualOverride: assessment.requiresManualOverride,
      requiresManualReview: assessment.requiresManualReview,
      resolvedCompanyId: assessment.resolvedCompanyId,
    });
  }

  return rows;
}

function resultFromAssessment(
  orderId: string,
  dryRun: boolean,
  assessment: Awaited<ReturnType<typeof assessReconcileEligibility>>,
): ReconcilePaidPurchaseResult {
  if (assessment.status === "manual_review_blocked") {
    logReconcileEvent("skipped_manual_review", { orderId, reason: assessment.reason });
  } else if (assessment.status === "qa_blocked") {
    logReconcileEvent("skipped_qa", { orderId, reason: assessment.reason });
  } else if (assessment.status === "company_conflict") {
    logReconcileEvent("company_conflict", {
      orderId,
      orderCompanyId: assessment.resolvedCompanyId,
      reason: assessment.reason,
    });
  }

  if (!assessment.wouldReconcile) {
    return {
      orderId,
      dryRun,
      action: "skipped",
      status: assessment.status,
      wouldReconcile: false,
      requiresManualOverride: assessment.requiresManualOverride,
      requiresManualReview: assessment.requiresManualReview,
      reason: assessment.reason,
      companyId: assessment.resolvedCompanyId,
    };
  }

  if (dryRun) {
    logReconcileEvent("dry_run", {
      orderId,
      companyId: assessment.resolvedCompanyId,
      status: "eligible",
    });
    return {
      orderId,
      dryRun: true,
      action: "would_reconcile",
      status: "eligible",
      wouldReconcile: true,
      companyId: assessment.resolvedCompanyId,
    };
  }

  return {
    orderId,
    dryRun: false,
    action: "would_reconcile",
    status: "eligible",
    wouldReconcile: true,
    companyId: assessment.resolvedCompanyId,
  };
}

export async function reconcilePaidPurchase(
  orderId: string,
  options: ReconcilePurchaseOptions = {},
): Promise<ReconcilePaidPurchaseResult> {
  const dryRun = options.dryRun !== false;
  const order = await getOrderById(orderId);
  if (!order) {
    return {
      orderId,
      dryRun,
      action: "skipped",
      status: "order_not_found",
      wouldReconcile: false,
      reason: "order_not_found",
    };
  }

  const assessment = await assessReconcileEligibility(order, options);
  if (!assessment.wouldReconcile) {
    return resultFromAssessment(orderId, dryRun, assessment);
  }

  let companyId = assessment.resolvedCompanyId;
  if (!companyId && dryRun) {
    return resultFromAssessment(orderId, true, {
      ...assessment,
      resolvedCompanyId: null,
      wouldReconcile: true,
      status: "eligible",
    });
  }

  if (!companyId && !dryRun) {
    const email = purchaseEmail(order);
    if (!email) {
      return {
        orderId,
        dryRun: false,
        action: "failed",
        status: "missing_email",
        wouldReconcile: false,
        reason: "missing_email",
      };
    }
    companyId = await createCompanyForPaidPurchase(email, order);
  }

  if (!companyId) {
    return {
      orderId,
      dryRun,
      action: "failed",
      status: "no_company",
      wouldReconcile: false,
      reason: "no_company",
    };
  }

  if (dryRun) {
    return resultFromAssessment(orderId, true, {
      ...assessment,
      resolvedCompanyId: companyId,
    });
  }

  try {
    const prepare = await prepareOrderForCredit(orderId, companyId);
    if (!prepare.ok) {
      logReconcileEvent("company_conflict", { orderId, companyId });
      return {
        orderId,
        dryRun: false,
        action: "skipped",
        status: "company_conflict",
        wouldReconcile: false,
        requiresManualOverride: true,
        requiresManualReview: true,
        reason: "company_id_mismatch_on_apply",
        companyId,
      };
    }

    await getOrCreateCompanyWallet(companyId, "CL");
    const credit = await confirmOrderCredit(orderId, options.actorUserId ?? null, {
      ratePlanSource: options.source ?? "paid_purchase_reconcile",
    });

    logReconcileEvent("credit_applied", {
      orderId,
      companyId,
      alreadyCredited: credit.alreadyCredited,
    });

    return {
      orderId,
      dryRun: false,
      action: credit.alreadyCredited ? "already_credited" : "reconciled",
      status: credit.alreadyCredited ? "already_credited" : "eligible",
      wouldReconcile: false,
      companyId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logReconcileEvent("failed", { orderId, companyId, error: message });
    return {
      orderId,
      dryRun: false,
      action: "failed",
      status: "eligible",
      wouldReconcile: false,
      companyId,
      error: message,
    };
  }
}

export async function reconcilePaidPurchasesForEmail(
  emailInput: string,
  options: ReconcilePurchaseOptions = {},
): Promise<ReconcilePaidPurchaseResult[]> {
  const email = normalizeAuditEmail(emailInput);
  if (!email) return [];

  const { data: orders, error } = await getSupabase()
    .from("sms_orders")
    .select("id")
    .eq("payment_status", "paid")
    .or(`checkout_email.ilike.${email},payer_email.ilike.${email}`);
  if (error) wrapSupabaseError(error, "reconcilePaidPurchasesForEmail");

  const results: ReconcilePaidPurchaseResult[] = [];
  for (const row of orders ?? []) {
    results.push(
      await reconcilePaidPurchase(String(row.id), {
        ...options,
        dryRun: options.dryRun !== false,
      }),
    );
  }
  return results;
}

export async function reconcileAllPaidUnclaimedPurchases(options: {
  dryRun?: boolean;
  email?: string;
  all?: boolean;
  actorUserId?: string | null;
  source?: string;
  forceManualReview?: boolean;
  includeQa?: boolean;
}): Promise<ReconcilePaidPurchaseResult[]> {
  const dryRun = options.dryRun !== false;

  if (!dryRun && !options.email && !options.all) {
    throw new AppError(
      "Apply requiere --email=... o --all explícito.",
      400,
      "RECONCILE_APPLY_SCOPE_REQUIRED",
    );
  }

  const rows = await listPaidUnclaimedPurchases();
  const filtered = options.email
    ? rows.filter(
        (r) =>
          normalizeAuditEmail(r.checkoutEmail) ===
            normalizeAuditEmail(options.email) ||
          normalizeAuditEmail(r.payerEmail) ===
            normalizeAuditEmail(options.email),
      )
    : rows;

  const results: ReconcilePaidPurchaseResult[] = [];
  for (const row of filtered) {
    results.push(
      await reconcilePaidPurchase(row.orderId, {
        dryRun,
        actorUserId: options.actorUserId,
        source: options.source,
        forceManualReview: options.forceManualReview,
        includeQa: options.includeQa,
      }),
    );
  }
  return results;
}
