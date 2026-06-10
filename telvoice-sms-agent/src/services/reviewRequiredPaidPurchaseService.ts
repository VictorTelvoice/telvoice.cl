import { getSupabase } from "../database/supabaseClient.js";
import type { AuditClassification } from "../types/adminDataAudit.js";
import type { SmsOrderRow } from "../types/wallet.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { markEntityAsProdReal } from "./adminDataAuditService.js";
import {
  isCleanupCandidate,
  normalizeAuditEmail,
  orderHasRealPayment,
  PROTECTED_CLIENT_EMAILS,
} from "./adminDataAuditClassifier.js";
import {
  findCompanyCandidatesByEmail,
  listPaidUnclaimedPurchases,
  reconcilePaidPurchase,
  type CompanyCandidate,
  type ReconcileEligibilityStatus,
  type ReconcilePaidPurchaseResult,
} from "./billingPurchaseReconciliationService.js";
import { isExplicitTestPurchaseEmail } from "./adminProductionScopeService.js";
import {
  emailLooksQa,
  orderLooksQa,
} from "./adminDataAuditClassifier.js";
import { hasActiveOrSentBillingEmail } from "./billingEmailClaimService.js";
import { getInvoiceByOrderId } from "./billingInvoiceService.js";
import {
  ensureDefaultRetailRatePlanForCompany,
  getDefaultRetailRatePlan,
  hasActiveRetailRatePlan,
} from "./defaultRetailRatePlanService.js";
import { listActiveCompanyRatePlans } from "./companyRatePlanService.js";
import { getOrderById } from "./smsOrderService.js";
import { hasPurchaseCreditForOrder } from "./walletTransactionService.js";

const REVIEW_CLASSIFICATIONS = new Set<AuditClassification>([
  "REVIEW_REQUIRED",
  "ORPHAN",
]);

export const RESOLVE_MANUAL_REVIEW_CONFIRM = "RESOLVER MANUAL REVIEW MP";

export type ManualReviewResolutionStatus =
  | "eligible_after_manual_review_resolution"
  | "multiple_company_candidates"
  | "manual_review_blocked"
  | "company_conflict"
  | "not_paid"
  | "qa_blocked"
  | "missing_email"
  | "order_not_found";

export type ManualReviewResolutionResult = {
  orderId: string;
  purchaseEmail: string;
  status: ManualReviewResolutionStatus;
  wouldReconcile: boolean;
  companyId: string | null;
  companyCandidates: CompanyCandidate[];
  requiresCompanyId: boolean;
  previousClaimStatus: string | null;
  manualReviewReason: string | null;
  manualReviewEmail: string | null;
  smsQuantity: number | null;
  amount: number | null;
  recommendedRatePlan: string | null;
};

export type ReviewRequiredRiskStatus =
  | ReconcileEligibilityStatus
  | "missing_payment"
  | "missing_package"
  | "missing_rate_plan"
  | "needs_human_review"
  | "no_action";

export type ReviewRequiredRecommendedAction =
  | "activate_paid_purchase"
  | "assign_rate_plan_only"
  | "no_action"
  | "manual_review_required";

export type ReviewRequiredPaidPurchaseRow = {
  email: string;
  companyId: string | null;
  companyName: string | null;
  currentClassification: AuditClassification | null;
  protected: boolean;
  cleanupCandidate: boolean;
  paymentStatus: string | null;
  creditStatus: string | null;
  claimStatus: string | null;
  hasMercadoPagoApprovedPayment: boolean;
  orderId: string | null;
  amount: number | null;
  smsQuantity: number | null;
  hasWallet: boolean;
  walletBalance: number | null;
  hasPurchaseCreditForOrder: boolean;
  hasInvoice: boolean;
  hasReceiptEmail: boolean;
  hasRatePlan: boolean;
  currentRatePlan: string | null;
  recommendedRatePlan: string | null;
  riskStatus: ReviewRequiredRiskStatus;
  recommendedAction: ReviewRequiredRecommendedAction;
  reconcileStatus: ReconcileEligibilityStatus | null;
  wouldReconcile: boolean;
  requiresManualOverride: boolean;
};

export type ReviewRequiredAuditSummary = {
  totalReviewRequiredAccounts: number;
  totalWithMercadoPagoApproved: number;
  eligible: number;
  manualReviewBlocked: number;
  qaBlocked: number;
  companyConflict: number;
  alreadyCredited: number;
  missingPayment: number;
  missingEmail: number;
  missingPackage: number;
  missingRatePlan: number;
  needsHumanReview: number;
  noAction: number;
};

function logReviewRequiredEvent(
  event:
    | "activated"
    | "manual_review_resolved",
  payload: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      event: `review_required_paid_purchase.${event}`,
      at: new Date().toISOString(),
      ...payload,
    }),
  );
}

function orderEmail(order: SmsOrderRow): string {
  return normalizeAuditEmail(order.checkout_email ?? order.payer_email);
}

function isMercadoPagoOrder(order: SmsOrderRow): boolean {
  const meta =
    order.metadata && typeof order.metadata === "object"
      ? (order.metadata as Record<string, unknown>)
      : {};
  if (String(order.payment_provider ?? "").toLowerCase() === "mercadopago") {
    return true;
  }
  if (meta.mercadopago_payment_id || meta.mercado_pago_payment_id) return true;
  if (meta.mercadopago_preference_id) return true;
  if (meta.checkout_mode === "mercadopago") return true;
  if (meta.source === "landing" && meta.claim_required === true) return true;
  return false;
}

function hasMercadoPagoApprovedPayment(order: SmsOrderRow): boolean {
  if (order.payment_status !== "paid") return false;
  if (!isMercadoPagoOrder(order) && !orderHasRealPayment(order as unknown as Record<string, unknown>)) {
    return false;
  }
  return Number(order.amount) > 0;
}

function mapRiskToAction(
  risk: ReviewRequiredRiskStatus,
): ReviewRequiredRecommendedAction {
  if (risk === "eligible") return "activate_paid_purchase";
  if (risk === "manual_review_blocked") return "manual_review_required";
  if (risk === "already_credited") return "no_action";
  if (risk === "qa_blocked" || risk === "test_email") return "no_action";
  if (risk === "company_conflict" || risk === "needs_human_review") {
    return "manual_review_required";
  }
  if (risk === "missing_rate_plan") return "manual_review_required";
  return "no_action";
}

async function getAuditFlag(
  entityType: "company" | "sms_order",
  entityId: string,
): Promise<{
  classification: AuditClassification | null;
  protected: boolean;
} | null> {
  const { data, error } = await getSupabase()
    .from("admin_data_audit_flags")
    .select("classification, protected")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .maybeSingle();
  if (error) wrapSupabaseError(error, "getAuditFlag");
  if (!data) return null;
  return {
    classification: data.classification as AuditClassification,
    protected: Boolean(data.protected),
  };
}

async function getCompanyBasics(companyId: string): Promise<{
  name: string | null;
  billingEmail: string | null;
  status: string | null;
} | null> {
  const { data } = await getSupabase()
    .from("companies")
    .select("name, legal_name, billing_email, status")
    .eq("id", companyId)
    .maybeSingle();
  if (!data) return null;
  return {
    name: String(data.name ?? data.legal_name ?? ""),
    billingEmail: data.billing_email ? normalizeAuditEmail(data.billing_email) : null,
    status: data.status ? String(data.status) : null,
  };
}

async function getWalletBalance(companyId: string): Promise<{
  hasWallet: boolean;
  balance: number | null;
}> {
  const { data } = await getSupabase()
    .from("company_sms_wallets")
    .select("available_sms")
    .eq("company_id", companyId)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return { hasWallet: false, balance: null };
  return {
    hasWallet: true,
    balance: Number(data.available_sms ?? 0),
  };
}

async function getCurrentRatePlanLabel(companyId: string): Promise<{
  hasRatePlan: boolean;
  label: string | null;
}> {
  const plans = await listActiveCompanyRatePlans(companyId, "CL");
  if (plans.length === 0) return { hasRatePlan: false, label: null };
  const p = plans[0]!;
  const code = (p as { rate_plan_code?: string }).rate_plan_code;
  const name = (p as { rate_plan_name?: string }).rate_plan_name;
  return {
    hasRatePlan: true,
    label: code ?? name ?? p.rate_plan_id ?? null,
  };
}

async function getRecommendedRatePlanLabel(): Promise<string | null> {
  const { config, ratePlan } = await getDefaultRetailRatePlan();
  if (!ratePlan) return null;
  return ratePlan.code ?? config.ratePlanCode ?? config.ratePlanId;
}

async function buildRowForOrder(
  order: SmsOrderRow,
  companyClassification: AuditClassification | null,
  companyProtected: boolean,
): Promise<ReviewRequiredPaidPurchaseRow> {
  const email = orderEmail(order);
  const companyId = order.company_id;
  const company = companyId ? await getCompanyBasics(companyId) : null;
  const orderFlag = await getAuditFlag("sms_order", order.id);
  const currentClassification =
    orderFlag?.classification ?? companyClassification ?? null;
  const protectedFlag =
    Boolean(orderFlag?.protected) ||
    companyProtected ||
    PROTECTED_CLIENT_EMAILS.has(email);

  const wallet = companyId
    ? await getWalletBalance(companyId)
    : { hasWallet: false, balance: null };
  const ratePlan = companyId
    ? await getCurrentRatePlanLabel(companyId)
    : { hasRatePlan: false, label: null };
  const recommendedRatePlan = await getRecommendedRatePlanLabel();
  const hasCredit = await hasPurchaseCreditForOrder(order.id);
  const invoice = await getInvoiceByOrderId(order.id);
  const hasReceipt =
    invoice != null && (await hasActiveOrSentBillingEmail(invoice.id));

  const mpApproved = hasMercadoPagoApprovedPayment(order);
  const reconcile = await reconcilePaidPurchase(order.id, { dryRun: true });

  let riskStatus: ReviewRequiredRiskStatus = reconcile.status;
  if (!mpApproved && order.payment_status !== "paid") {
    riskStatus = "missing_payment";
  } else if (!email) {
    riskStatus = "missing_email";
  } else if (mpApproved && Number(order.sms_quantity) <= 0) {
    riskStatus = "missing_package";
  } else if (
    reconcile.status === "eligible" &&
    !recommendedRatePlan
  ) {
    riskStatus = "missing_rate_plan";
  } else if (
    protectedFlag &&
    reconcile.status !== "eligible" &&
    reconcile.status !== "already_credited" &&
    ![
      "manual_review_blocked",
      "qa_blocked",
      "company_conflict",
      "test_email",
    ].includes(reconcile.status)
  ) {
    riskStatus = "needs_human_review";
  }

  let recommendedAction = mapRiskToAction(riskStatus);
  if (
    reconcile.status === "already_credited" &&
    companyId &&
    !(await hasActiveRetailRatePlan(companyId)) &&
    recommendedRatePlan
  ) {
    recommendedAction = "assign_rate_plan_only";
  }

  return {
    email,
    companyId,
    companyName: company?.name ?? null,
    currentClassification,
    protected: protectedFlag,
    cleanupCandidate: currentClassification
      ? isCleanupCandidate(currentClassification)
      : false,
    paymentStatus: order.payment_status,
    creditStatus: order.credit_status,
    claimStatus: order.claim_status ?? null,
    hasMercadoPagoApprovedPayment: mpApproved,
    orderId: order.id,
    amount: order.amount,
    smsQuantity: order.sms_quantity,
    hasWallet: wallet.hasWallet,
    walletBalance: wallet.balance,
    hasPurchaseCreditForOrder: hasCredit,
    hasInvoice: invoice != null,
    hasReceiptEmail: hasReceipt,
    hasRatePlan: ratePlan.hasRatePlan,
    currentRatePlan: ratePlan.label,
    recommendedRatePlan,
    riskStatus,
    recommendedAction,
    reconcileStatus: reconcile.status,
    wouldReconcile: reconcile.wouldReconcile,
    requiresManualOverride: Boolean(reconcile.requiresManualOverride),
  };
}

async function loadReviewRequiredCompanyIds(): Promise<
  Map<string, { classification: AuditClassification; protected: boolean }>
> {
  const map = new Map<
    string,
    { classification: AuditClassification; protected: boolean }
  >();
  const { data, error } = await getSupabase()
    .from("admin_data_audit_flags")
    .select("entity_id, classification, protected")
    .eq("entity_type", "company")
    .in("classification", ["REVIEW_REQUIRED", "ORPHAN"]);
  if (error) wrapSupabaseError(error, "loadReviewRequiredCompanyIds");
  for (const row of data ?? []) {
    map.set(String(row.entity_id), {
      classification: row.classification as AuditClassification,
      protected: Boolean(row.protected),
    });
  }
  return map;
}

async function loadPaidOrdersForScope(): Promise<SmsOrderRow[]> {
  const paidUnclaimed = await listPaidUnclaimedPurchases();
  const orderIds = new Set(paidUnclaimed.map((r) => r.orderId));

  const reviewCompanies = await loadReviewRequiredCompanyIds();
  if (reviewCompanies.size > 0) {
    const ids = [...reviewCompanies.keys()];
    const { data, error } = await getSupabase()
      .from("sms_orders")
      .select(
        "id, company_id, checkout_email, payer_email, payment_status, credit_status, claim_status, payment_provider, payment_reference, amount, sms_quantity, metadata",
      )
      .in("company_id", ids)
      .eq("payment_status", "paid");
    if (error) wrapSupabaseError(error, "loadPaidOrdersForScope.byCompany");
    for (const raw of data ?? []) {
      orderIds.add(String((raw as SmsOrderRow).id));
    }
  }

  const orders: SmsOrderRow[] = [];
  for (const orderId of orderIds) {
    const order = await getOrderById(orderId);
    if (order) orders.push(order);
  }
  return orders;
}

function buildSummary(
  rows: ReviewRequiredPaidPurchaseRow[],
): ReviewRequiredAuditSummary {
  const uniqueEmails = new Set(rows.map((r) => r.email).filter(Boolean));
  return {
    totalReviewRequiredAccounts: uniqueEmails.size,
    totalWithMercadoPagoApproved: rows.filter((r) => r.hasMercadoPagoApprovedPayment)
      .length,
    eligible: rows.filter((r) => r.riskStatus === "eligible").length,
    manualReviewBlocked: rows.filter(
      (r) => r.riskStatus === "manual_review_blocked",
    ).length,
    qaBlocked: rows.filter((r) => r.riskStatus === "qa_blocked").length,
    companyConflict: rows.filter((r) => r.riskStatus === "company_conflict")
      .length,
    alreadyCredited: rows.filter((r) => r.riskStatus === "already_credited")
      .length,
    missingPayment: rows.filter((r) => r.riskStatus === "missing_payment")
      .length,
    missingEmail: rows.filter((r) => r.riskStatus === "missing_email").length,
    missingPackage: rows.filter((r) => r.riskStatus === "missing_package")
      .length,
    missingRatePlan: rows.filter((r) => r.riskStatus === "missing_rate_plan")
      .length,
    needsHumanReview: rows.filter((r) => r.riskStatus === "needs_human_review")
      .length,
    noAction: rows.filter(
      (r) =>
        r.recommendedAction === "no_action" && r.riskStatus !== "eligible",
    ).length,
  };
}

export async function auditReviewRequiredPaidPurchases(): Promise<{
  summary: ReviewRequiredAuditSummary;
  rows: ReviewRequiredPaidPurchaseRow[];
}> {
  const reviewCompanies = await loadReviewRequiredCompanyIds();
  const paidUnclaimed = await listPaidUnclaimedPurchases();
  const paidUnclaimedIds = new Set(paidUnclaimed.map((r) => r.orderId));
  const orders = await loadPaidOrdersForScope();
  const rows: ReviewRequiredPaidPurchaseRow[] = [];

  for (const order of orders) {
    const companyMeta = order.company_id
      ? reviewCompanies.get(order.company_id)
      : undefined;
    const orderFlag = await getAuditFlag("sms_order", order.id);
    const inReviewScope =
      companyMeta != null ||
      (orderFlag?.classification != null &&
        REVIEW_CLASSIFICATIONS.has(orderFlag.classification)) ||
      paidUnclaimedIds.has(order.id);

    if (!inReviewScope) continue;

    rows.push(
      await buildRowForOrder(
        order,
        companyMeta?.classification ?? orderFlag?.classification ?? null,
        companyMeta?.protected ?? orderFlag?.protected ?? false,
      ),
    );
  }

  const companyOnlyRows: ReviewRequiredPaidPurchaseRow[] = [];
  for (const [companyId, meta] of reviewCompanies) {
    if (rows.some((r) => r.companyId === companyId)) continue;
    const company = await getCompanyBasics(companyId);
    const email = company?.billingEmail ?? "";
    companyOnlyRows.push({
      email,
      companyId,
      companyName: company?.name ?? null,
      currentClassification: meta.classification,
      protected: meta.protected,
      cleanupCandidate: isCleanupCandidate(meta.classification),
      paymentStatus: null,
      creditStatus: null,
      claimStatus: null,
      hasMercadoPagoApprovedPayment: false,
      orderId: null,
      amount: null,
      smsQuantity: null,
      hasWallet: (await getWalletBalance(companyId)).hasWallet,
      walletBalance: (await getWalletBalance(companyId)).balance,
      hasPurchaseCreditForOrder: false,
      hasInvoice: false,
      hasReceiptEmail: false,
      hasRatePlan: (await getCurrentRatePlanLabel(companyId)).hasRatePlan,
      currentRatePlan: (await getCurrentRatePlanLabel(companyId)).label,
      recommendedRatePlan: await getRecommendedRatePlanLabel(),
      riskStatus: "missing_payment",
      recommendedAction: "no_action",
      reconcileStatus: null,
      wouldReconcile: false,
      requiresManualOverride: false,
    });
  }

  const allRows = [...rows, ...companyOnlyRows];
  return { summary: buildSummary(allRows), rows: allRows };
}

export type ReviewRequiredReconcileOptions = {
  dryRun?: boolean;
  email?: string;
  all?: boolean;
  confirm?: string;
  forceManualReview?: boolean;
  includeQa?: boolean;
  resolveManualReview?: boolean;
  companyId?: string;
  actorEmail?: string | null;
};

export type ReviewRequiredReconcileResult = ReconcilePaidPurchaseResult & {
  email?: string;
  ratePlanAssigned?: boolean;
  auditFlagsUpdated?: boolean;
  resolutionStatus?: ManualReviewResolutionStatus;
  companyCandidates?: CompanyCandidate[];
  requiresCompanyId?: boolean;
  manualReviewReason?: string | null;
  manualReviewEmail?: string | null;
  recommendedRatePlan?: string | null;
};

function orderPurchaseEmail(order: SmsOrderRow): string {
  return normalizeAuditEmail(order.checkout_email ?? order.payer_email);
}

function orderManualReviewMeta(order: SmsOrderRow): {
  reason: string | null;
  email: string | null;
} {
  const meta =
    order.metadata && typeof order.metadata === "object"
      ? (order.metadata as Record<string, unknown>)
      : {};
  return {
    reason:
      typeof meta.manual_review_reason === "string"
        ? meta.manual_review_reason
        : null,
    email:
      typeof meta.manual_review_email === "string"
        ? normalizeAuditEmail(meta.manual_review_email)
        : null,
  };
}

async function isQaBlockedForResolution(
  order: SmsOrderRow,
  purchaseEmail: string,
  companyId: string | null,
): Promise<boolean> {
  if (isExplicitTestPurchaseEmail(purchaseEmail)) return true;
  if (orderLooksQa(order as unknown as Record<string, unknown>)) return true;
  if (emailLooksQa(purchaseEmail)) return true;
  if (!companyId) return false;
  const { data } = await getSupabase()
    .from("companies")
    .select("name, legal_name, billing_email")
    .eq("id", companyId)
    .maybeSingle();
  if (!data) return false;
  const name = String(data.name ?? data.legal_name ?? "");
  if (emailLooksQa(normalizeAuditEmail(data.billing_email)) || /qa\s/i.test(name)) {
    return true;
  }
  return false;
}

export async function assessManualReviewResolution(
  orderId: string,
  purchaseEmailInput: string,
  options: {
    resolveManualReview?: boolean;
    confirm?: string;
    companyId?: string;
    includeQa?: boolean;
  },
): Promise<ManualReviewResolutionResult> {
  const purchaseEmail = normalizeAuditEmail(purchaseEmailInput);
  const { ratePlan } = await getDefaultRetailRatePlan();
  const recommendedRatePlan = ratePlan?.code ?? null;

  const empty = (
    status: ManualReviewResolutionStatus,
    extra: Partial<ManualReviewResolutionResult> = {},
  ): ManualReviewResolutionResult => ({
    orderId,
    purchaseEmail,
    status,
    wouldReconcile: false,
    companyId: null,
    companyCandidates: [],
    requiresCompanyId: false,
    previousClaimStatus: null,
    manualReviewReason: null,
    manualReviewEmail: null,
    smsQuantity: null,
    amount: null,
    recommendedRatePlan,
    ...extra,
  });

  if (!options.resolveManualReview) {
    return empty("manual_review_blocked");
  }
  if (options.confirm !== RESOLVE_MANUAL_REVIEW_CONFIRM) {
    throw new AppError(
      `--resolve-manual-review requiere --confirm="${RESOLVE_MANUAL_REVIEW_CONFIRM}".`,
      400,
      "RESOLVE_MANUAL_REVIEW_CONFIRM_REQUIRED",
    );
  }

  const order = await getOrderById(orderId);
  if (!order) return empty("order_not_found");

  const mr = orderManualReviewMeta(order);
  const orderEmail = orderPurchaseEmail(order);

  if (order.claim_status !== "manual_review") {
    return empty("manual_review_blocked", {
      previousClaimStatus: order.claim_status ?? null,
      manualReviewReason: mr.reason,
      manualReviewEmail: mr.email,
      smsQuantity: order.sms_quantity,
      amount: order.amount,
    });
  }

  if (order.payment_status !== "paid") {
    return empty("not_paid", {
      previousClaimStatus: order.claim_status,
      manualReviewReason: mr.reason,
      manualReviewEmail: mr.email,
      smsQuantity: order.sms_quantity,
      amount: order.amount,
    });
  }

  if (!purchaseEmail || purchaseEmail !== orderEmail) {
    return empty("missing_email", {
      previousClaimStatus: order.claim_status,
      manualReviewReason: mr.reason,
      manualReviewEmail: mr.email,
      smsQuantity: order.sms_quantity,
      amount: order.amount,
    });
  }

  if (!options.includeQa && (await isQaBlockedForResolution(order, purchaseEmail, null))) {
    return empty("qa_blocked", {
      previousClaimStatus: order.claim_status,
      manualReviewReason: mr.reason,
      manualReviewEmail: mr.email,
      smsQuantity: order.sms_quantity,
      amount: order.amount,
    });
  }

  const candidates = await findCompanyCandidatesByEmail(purchaseEmail);
  const safeCandidates: CompanyCandidate[] = [];
  for (const c of candidates) {
    if (!options.includeQa && (await isQaBlockedForResolution(order, purchaseEmail, c.id))) {
      continue;
    }
    safeCandidates.push(c);
  }

  let selectedCompanyId: string | null = null;
  if (options.companyId) {
    const match = safeCandidates.find((c) => c.id === options.companyId);
    if (!match) {
      return empty("company_conflict", {
        companyCandidates: safeCandidates,
        requiresCompanyId: true,
        previousClaimStatus: order.claim_status,
        manualReviewReason: mr.reason,
        manualReviewEmail: mr.email,
        smsQuantity: order.sms_quantity,
        amount: order.amount,
      });
    }
    selectedCompanyId = match.id;
  } else if (safeCandidates.length === 1) {
    selectedCompanyId = safeCandidates[0]!.id;
  } else if (safeCandidates.length === 0) {
    return empty("company_conflict", {
      companyCandidates: [],
      requiresCompanyId: true,
      previousClaimStatus: order.claim_status,
      manualReviewReason: mr.reason,
      manualReviewEmail: mr.email,
      smsQuantity: order.sms_quantity,
      amount: order.amount,
    });
  } else {
    return empty("multiple_company_candidates", {
      companyCandidates: safeCandidates,
      requiresCompanyId: true,
      previousClaimStatus: order.claim_status,
      manualReviewReason: mr.reason,
      manualReviewEmail: mr.email,
      smsQuantity: order.sms_quantity,
      amount: order.amount,
    });
  }

  if (order.company_id && order.company_id !== selectedCompanyId) {
    return empty("company_conflict", {
      companyId: order.company_id,
      companyCandidates: safeCandidates,
      previousClaimStatus: order.claim_status,
      manualReviewReason: mr.reason,
      manualReviewEmail: mr.email,
      smsQuantity: order.sms_quantity,
      amount: order.amount,
    });
  }

  console.log(
    JSON.stringify({
      event: "purchase_reconcile.manual_review_resolved",
      at: new Date().toISOString(),
      orderId,
      purchaseEmail,
      companyId: selectedCompanyId,
      previous_claim_status: order.claim_status,
      manual_review_reason: mr.reason,
      manual_review_email: mr.email,
      resolved_by_script: true,
      reason: "MercadoPago approved payment matched by email",
    }),
  );

  return {
    orderId,
    purchaseEmail,
    status: "eligible_after_manual_review_resolution",
    wouldReconcile: true,
    companyId: selectedCompanyId,
    companyCandidates: safeCandidates,
    requiresCompanyId: false,
    previousClaimStatus: order.claim_status,
    manualReviewReason: mr.reason,
    manualReviewEmail: mr.email,
    smsQuantity: order.sms_quantity,
    amount: order.amount,
    recommendedRatePlan,
  };
}

async function applyProdActivationForOrder(
  orderId: string,
  options: ReviewRequiredReconcileOptions,
): Promise<ReviewRequiredReconcileResult> {
  const order = await getOrderById(orderId);
  const email = order ? orderEmail(order) : "";

  if (PROTECTED_CLIENT_EMAILS.has(email) && order?.credit_status === "credited") {
    return {
      orderId,
      dryRun: false,
      action: "already_credited",
      status: "already_credited",
      wouldReconcile: false,
      email,
      auditFlagsUpdated: false,
      ratePlanAssigned: false,
    };
  }

  const { ratePlan } = await getDefaultRetailRatePlan();
  if (!ratePlan) {
    throw new AppError(
      "No existe rate plan retail productivo default. Definir TELVOICE_CL_RETAIL antes de activar.",
      500,
      "MISSING_RATE_PLAN",
    );
  }

  let resolvedCompanyId = options.companyId;
  if (options.resolveManualReview && options.email) {
    const resolution = await assessManualReviewResolution(orderId, options.email, {
      resolveManualReview: true,
      confirm: options.confirm,
      companyId: options.companyId,
      includeQa: options.includeQa,
    });
    if (resolution.status !== "eligible_after_manual_review_resolution") {
      return {
        orderId,
        dryRun: false,
        action: "skipped",
        status: resolution.status as ReconcileEligibilityStatus,
        wouldReconcile: false,
        email,
        resolutionStatus: resolution.status,
        reason: resolution.status,
      };
    }
    resolvedCompanyId = resolution.companyId ?? options.companyId;
    logReviewRequiredEvent("manual_review_resolved", {
      orderId,
      purchaseEmail: resolution.purchaseEmail,
      companyId: resolvedCompanyId,
      previousClaimStatus: resolution.previousClaimStatus,
      manualReviewReason: resolution.manualReviewReason,
      resolved_by_script: true,
      reason: "MercadoPago approved payment matched by email",
    });
  }

  const reconcile = await reconcilePaidPurchase(orderId, {
    dryRun: false,
    actorUserId: options.actorEmail ?? null,
    source: "review_required_paid_purchase",
    forceManualReview: options.forceManualReview,
    includeQa: options.includeQa,
    manualReviewResolved: Boolean(options.resolveManualReview),
    resolvedCompanyId,
  });

  if (reconcile.action !== "reconciled" && reconcile.action !== "already_credited") {
    return { ...reconcile, email, ratePlanAssigned: false, auditFlagsUpdated: false };
  }

  const companyId = reconcile.companyId ?? order?.company_id;
  let ratePlanAssigned = false;
  if (companyId) {
    const assignment = await ensureDefaultRetailRatePlanForCompany(companyId, {
      source: "review_required_paid_purchase",
      orderId,
      actorUserId: options.actorEmail ?? null,
    });
    ratePlanAssigned = assignment?.status === "assigned";
  }

  let auditFlagsUpdated = false;
  if (companyId) {
    await markEntityAsProdReal({
      entityType: "company",
      entityId: companyId,
      actorEmail: options.actorEmail ?? null,
    });
    auditFlagsUpdated = true;
  }
  await markEntityAsProdReal({
    entityType: "sms_order",
    entityId: orderId,
    actorEmail: options.actorEmail ?? null,
  });
  auditFlagsUpdated = true;

  logReviewRequiredEvent("activated", {
    orderId,
    email,
    companyId,
    ratePlanAssigned,
    auditFlagsUpdated,
    forceManualReview: Boolean(options.forceManualReview),
  });

  return {
    ...reconcile,
    email,
    ratePlanAssigned,
    auditFlagsUpdated,
  };
}

export async function reconcileReviewRequiredPaidPurchases(
  options: ReviewRequiredReconcileOptions = {},
): Promise<{
  summary: ReviewRequiredAuditSummary;
  results: ReviewRequiredReconcileResult[];
}> {
  const dryRun = options.dryRun !== false;

  if (!dryRun) {
    if (!options.email) {
      throw new AppError(
        "Apply requiere --email exacto.",
        400,
        "REVIEW_REQUIRED_APPLY_EMAIL_REQUIRED",
      );
    }
    if (options.all) {
      const expected = 'ACTIVAR COMPRAS MP REALES';
      if (options.confirm !== expected) {
        throw new AppError(
          `Apply masivo requiere --confirm="${expected}".`,
          400,
          "REVIEW_REQUIRED_APPLY_CONFIRM_REQUIRED",
        );
      }
    }
  }

  const audit = await auditReviewRequiredPaidPurchases();
  let targetRows = audit.rows.filter((r) => r.hasMercadoPagoApprovedPayment);

  if (options.email) {
    const email = normalizeAuditEmail(options.email);
    targetRows = targetRows.filter((r) => r.email === email);
  }

  const results: ReviewRequiredReconcileResult[] = [];

  if (dryRun) {
    for (const row of targetRows) {
      if (!row.orderId) {
        results.push({
          orderId: "",
          dryRun: true,
          action: "skipped",
          status: row.riskStatus as ReconcileEligibilityStatus,
          wouldReconcile: row.wouldReconcile,
          email: row.email,
          reason: row.riskStatus,
        });
        continue;
      }

      if (options.resolveManualReview && options.email) {
        const resolution = await assessManualReviewResolution(
          row.orderId,
          options.email,
          {
            resolveManualReview: true,
            confirm: options.confirm,
            companyId: options.companyId,
            includeQa: options.includeQa,
          },
        );
        results.push({
          orderId: row.orderId,
          dryRun: true,
          action: resolution.wouldReconcile ? "would_reconcile" : "skipped",
          status:
            resolution.status === "eligible_after_manual_review_resolution"
              ? "eligible"
              : (resolution.status as ReconcileEligibilityStatus),
          wouldReconcile: resolution.wouldReconcile,
          email: row.email,
          companyId: resolution.companyId,
          resolutionStatus: resolution.status,
          companyCandidates: resolution.companyCandidates,
          requiresCompanyId: resolution.requiresCompanyId,
          manualReviewReason: resolution.manualReviewReason,
          manualReviewEmail: resolution.manualReviewEmail,
          recommendedRatePlan: resolution.recommendedRatePlan,
          reason: resolution.manualReviewReason ?? resolution.status,
        });
        continue;
      }

      const reconcile = await reconcilePaidPurchase(row.orderId, {
        dryRun: true,
        forceManualReview: options.forceManualReview,
        includeQa: options.includeQa,
        source: "review_required_paid_purchase_dry_run",
      });
      results.push({ ...reconcile, email: row.email });
    }
    return { summary: buildSummary(audit.rows), results };
  }

  for (const row of targetRows) {
    if (!row.orderId) continue;

    if (options.resolveManualReview && options.email) {
      const resolution = await assessManualReviewResolution(
        row.orderId,
        options.email,
        {
          resolveManualReview: true,
          confirm: options.confirm,
          companyId: options.companyId,
          includeQa: options.includeQa,
        },
      );
      if (resolution.status !== "eligible_after_manual_review_resolution") {
        results.push({
          orderId: row.orderId,
          dryRun: false,
          action: "skipped",
          status: resolution.status as ReconcileEligibilityStatus,
          wouldReconcile: false,
          email: row.email,
          resolutionStatus: resolution.status,
          companyCandidates: resolution.companyCandidates,
          requiresCompanyId: resolution.requiresCompanyId,
          reason: resolution.status,
        });
        continue;
      }
      results.push(
        await applyProdActivationForOrder(row.orderId, {
          ...options,
          companyId: resolution.companyId ?? options.companyId,
          resolveManualReview: true,
        }),
      );
      continue;
    }

    if (row.riskStatus !== "eligible" && !options.forceManualReview) {
      results.push({
        orderId: row.orderId,
        dryRun: false,
        action: "skipped",
        status: row.reconcileStatus ?? "not_paid",
        wouldReconcile: false,
        email: row.email,
        reason: row.riskStatus,
      });
      continue;
    }
    results.push(await applyProdActivationForOrder(row.orderId, options));
  }

  return {
    summary: buildSummary(audit.rows),
    results,
  };
}

export async function reconcileReviewRequiredPaidPurchaseForEmail(
  emailInput: string,
  options: ReviewRequiredReconcileOptions = {},
): Promise<ReviewRequiredReconcileResult[]> {
  const out = await reconcileReviewRequiredPaidPurchases({
    ...options,
    email: emailInput,
  });
  return out.results;
}
