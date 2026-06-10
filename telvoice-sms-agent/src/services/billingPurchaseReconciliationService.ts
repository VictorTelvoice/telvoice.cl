import { getSupabase } from "../database/supabaseClient.js";
import type { SmsOrderRow } from "../types/wallet.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { normalizeAuditEmail } from "./adminDataAuditClassifier.js";
import { isExplicitTestPurchaseEmail } from "./adminProductionScopeService.js";
import { runBillingSyncBestEffort } from "./billingSyncService.js";
import {
  confirmOrderCredit,
  getOrderById,
  patchOrderFields,
} from "./smsOrderService.js";
import { getOrCreateCompanyWallet } from "./smsWalletService.js";
import { hasPurchaseCreditForOrder } from "./walletTransactionService.js";

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
  reason?: string;
  companyId?: string | null;
  error?: string;
};

function purchaseEmail(order: SmsOrderRow): string {
  return normalizeAuditEmail(order.checkout_email ?? order.payer_email);
}

async function findCompanyIdByEmail(email: string): Promise<string | null> {
  if (!email) return null;
  const sb = getSupabase();

  const { data: companies, error: cErr } = await sb
    .from("companies")
    .select("id")
    .ilike("billing_email", email)
    .limit(1);
  if (cErr) wrapSupabaseError(cErr, "reconcile.findCompany");
  if (companies?.[0]?.id) return String(companies[0].id);

  const { data: profiles, error: pErr } = await sb
    .from("user_profiles")
    .select("company_id")
    .ilike("email", email)
    .not("company_id", "is", null)
    .limit(1);
  if (pErr) wrapSupabaseError(pErr, "reconcile.findProfile");
  if (profiles?.[0]?.company_id) return String(profiles[0].company_id);

  return null;
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

async function prepareOrderForCredit(
  orderId: string,
  companyId: string,
): Promise<void> {
  const order = await getOrderById(orderId);
  if (!order) return;

  const patch: Record<string, unknown> = {};
  if (order.company_id !== companyId) {
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
    const email = purchaseEmail(order);
    if (isExplicitTestPurchaseEmail(email)) continue;

    const hasCredit = await hasPurchaseCreditForOrder(order.id);
    if (hasCredit) continue;

    let companyName: string | null = null;
    if (order.company_id) {
      const { data: company } = await getSupabase()
        .from("companies")
        .select("name")
        .eq("id", order.company_id)
        .maybeSingle();
      companyName = company?.name ?? null;
    }

    let recommendation = "Acreditar saldo y vincular empresa por email.";
    if (!order.company_id) {
      recommendation = "Crear empresa por email de compra y acreditar saldo.";
    } else if (order.credit_status === "pending_claim") {
      recommendation =
        "Orden pagada con empresa existente; acreditar sin esperar claim.";
    }
    if (order.claim_status === "manual_review") {
      recommendation +=
        " Revisar email distinto al de Google; acreditar por pago MP aprobado.";
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
    });
  }

  return rows;
}

export async function reconcilePaidPurchase(
  orderId: string,
  options: {
    dryRun?: boolean;
    actorUserId?: string | null;
    source?: string;
  } = {},
): Promise<ReconcilePaidPurchaseResult> {
  const dryRun = options.dryRun !== false;
  const order = await getOrderById(orderId);
  if (!order) {
    return { orderId, dryRun, action: "skipped", reason: "order_not_found" };
  }
  if (order.payment_status !== "paid") {
    return { orderId, dryRun, action: "skipped", reason: "not_paid" };
  }

  const email = purchaseEmail(order);
  if (isExplicitTestPurchaseEmail(email)) {
    return { orderId, dryRun, action: "skipped", reason: "test_email" };
  }

  if (await hasPurchaseCreditForOrder(orderId)) {
    return {
      orderId,
      dryRun,
      action: "already_credited",
      companyId: order.company_id,
    };
  }

  let companyId = order.company_id;
  if (!companyId && email) {
    companyId = await findCompanyIdByEmail(email);
  }

  if (!companyId && dryRun) {
    return {
      orderId,
      dryRun: true,
      action: "would_reconcile",
      reason: email ? "would_create_or_link_company" : "missing_email",
      companyId: null,
    };
  }

  if (!companyId && !dryRun) {
    if (!email) {
      return { orderId, dryRun: false, action: "failed", reason: "missing_email" };
    }
    companyId = await createCompanyForPaidPurchase(email, order);
  }

  if (!companyId) {
    return { orderId, dryRun, action: "failed", reason: "no_company" };
  }

  if (dryRun) {
    return {
      orderId,
      dryRun: true,
      action: "would_reconcile",
      companyId,
    };
  }

  try {
    await getOrCreateCompanyWallet(companyId, "CL");
    await prepareOrderForCredit(orderId, companyId);
    const credit = await confirmOrderCredit(orderId, options.actorUserId ?? null, {
      ratePlanSource: options.source ?? "paid_purchase_reconcile",
    });

    try {
      await runBillingSyncBestEffort(orderId, {
        source: options.source ?? "paid_purchase_reconcile",
      });
    } catch (billingErr) {
      console.error("[reconcile] billing sync failed", orderId, billingErr);
    }

    return {
      orderId,
      dryRun: false,
      action: credit.alreadyCredited ? "already_credited" : "reconciled",
      companyId,
    };
  } catch (err) {
    return {
      orderId,
      dryRun: false,
      action: "failed",
      companyId,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function reconcilePaidPurchasesForEmail(
  emailInput: string,
  options: { dryRun?: boolean; actorUserId?: string | null; source?: string } = {},
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
  actorUserId?: string | null;
  source?: string;
}): Promise<ReconcilePaidPurchaseResult[]> {
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
        dryRun: options.dryRun !== false,
        actorUserId: options.actorUserId,
        source: options.source,
      }),
    );
  }
  return results;
}
