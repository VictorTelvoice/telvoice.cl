import {
  emailLooksQa,
  normalizeAuditEmail,
  orderLooksQa,
} from "./adminDataAuditClassifier.js";
import { markEntityAsProdReal } from "./adminDataAuditService.js";
import { isExplicitTestPurchaseEmail } from "./adminProductionScopeService.js";
import { isClientPanelMercadoPagoOrder } from "./mercadoPagoClientPanelService.js";
import { relinkEmptyProfilesToPurchasedCompany } from "./postPurchaseAccountLinkService.js";
import { getOrderById, patchOrderFields } from "./smsOrderService.js";
import {
  resolveTransactionalRecipient,
  sendWelcomeAndSmsCreditedEmail,
} from "./transactionalEmailService.js";
import { isWalletSmsCreditOrder } from "../utils/order-display.js";
import type { SmsOrderRow } from "../types/wallet.js";

export type ClientPanelPostCreditResult = {
  orderId: string;
  skipped: boolean;
  reason?: string;
  welcomeSent?: boolean;
  welcomeSkipped?: boolean;
  welcomeError?: string;
  prodRealMarked?: boolean;
  recipientEmail?: string | null;
  recipientSource?: string | null;
  orderEmailsBackfilled?: boolean;
};

function isClientPanelWalletBagPurchase(order: SmsOrderRow): boolean {
  if (!isClientPanelMercadoPagoOrder(order)) {
    return false;
  }
  if (!isWalletSmsCreditOrder(order)) {
    return false;
  }
  const meta = order.metadata ?? {};
  if (meta.subscription_payment === true) {
    return false;
  }
  if (meta.checkout_mode === "mercadopago_subscription") {
    return false;
  }
  if (meta.payment_card_setup === true) {
    return false;
  }
  return true;
}

function isQaPanelPurchase(order: SmsOrderRow, email: string): boolean {
  if (isExplicitTestPurchaseEmail(email)) return true;
  if (emailLooksQa(email)) return true;
  if (orderLooksQa(order as unknown as Record<string, unknown>)) return true;
  return false;
}

function logPostCredit(event: string, payload: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      event: `client_panel_post_credit.${event}`,
      at: new Date().toISOString(),
      ...payload,
    }),
  );
}

/**
 * Post-crédito panel cliente: bienvenida idempotente + PROD_REAL.
 * El comprobante lo envía runBillingSyncBestEffort (webhook MP).
 */
export async function runClientPanelPostCreditSideEffects(
  orderId: string,
  options: { source?: string } = {},
): Promise<ClientPanelPostCreditResult> {
  const source = options.source ?? "mercadopago_webhook/client_panel";
  const base: ClientPanelPostCreditResult = { orderId, skipped: false };

  let order = await getOrderById(orderId);
  if (!order) {
    return { ...base, skipped: true, reason: "order_not_found" };
  }
  if (!isClientPanelWalletBagPurchase(order)) {
    return { ...base, skipped: true, reason: "not_client_panel_wallet_bag" };
  }
  if (order.payment_status !== "paid" || order.credit_status !== "credited") {
    return { ...base, skipped: true, reason: "not_paid_or_credited" };
  }

  const resolution = await resolveTransactionalRecipient(order);
  const email = resolution.email;
  if (!email) {
    logPostCredit("recipient_missing", {
      orderId,
      companyId: order.company_id,
      source,
    });
    return { ...base, skipped: true, reason: "missing_recipient" };
  }

  if (isQaPanelPurchase(order, email)) {
    logPostCredit("qa_blocked", { orderId, email, source });
    return {
      ...base,
      skipped: true,
      reason: "qa_blocked",
      recipientEmail: email,
      recipientSource: resolution.source,
    };
  }

  let orderEmailsBackfilled = false;
  if (!normalizeAuditEmail(order.checkout_email)) {
    order = await patchOrderFields(orderId, {
      checkout_email: email,
      payer_email: normalizeAuditEmail(order.payer_email) || email,
      metadata: {
        recipient_backfill_source: resolution.source,
        recipient_backfilled_at: new Date().toISOString(),
      },
    });
    orderEmailsBackfilled = true;
  }

  const mpPaymentId = String(order.metadata?.mercadopago_payment_id ?? "");
  const auditMetadata = {
    source,
    order_id: orderId,
    payment_id: mpPaymentId || null,
    recipient_source: resolution.source,
    credited_at: order.credited_at,
  };

  let welcomeSent = false;
  let welcomeSkipped = false;
  let welcomeError: string | undefined;
  try {
    const welcomeResult = await sendWelcomeAndSmsCreditedEmail(orderId);
    welcomeSent = welcomeResult.ok === true && !welcomeResult.skipped;
    welcomeSkipped = welcomeResult.skipped === true;
    if (!welcomeResult.ok && welcomeResult.error) {
      welcomeError = welcomeResult.error;
    }
  } catch (err) {
    welcomeError = err instanceof Error ? err.message : String(err);
    console.error("[client-panel-post-credit] welcome failed", orderId, err);
  }

  let prodRealMarked = false;
  try {
    if (order.company_id) {
      await markEntityAsProdReal({
        entityType: "company",
        entityId: order.company_id,
        reason: "MercadoPago approved and credited",
        metadata: auditMetadata,
      });
    }
    await markEntityAsProdReal({
      entityType: "sms_order",
      entityId: orderId,
      reason: "MercadoPago approved and credited",
      metadata: auditMetadata,
    });
    prodRealMarked = true;
  } catch (err) {
    console.error("[client-panel-post-credit] prod_real mark failed", orderId, err);
  }

  let profilesRelinked = 0;
  if (order.company_id) {
    try {
      profilesRelinked = await relinkEmptyProfilesToPurchasedCompany(
        email,
        order.company_id,
      );
    } catch (err) {
      console.error("[client-panel-post-credit] profile relink failed", orderId, err);
    }
  }

  logPostCredit("completed", {
    orderId,
    companyId: order.company_id,
    recipientEmail: email,
    recipientSource: resolution.source,
    welcomeSent,
    welcomeSkipped,
    welcomeError: welcomeError ?? null,
    prodRealMarked,
    profilesRelinked,
    orderEmailsBackfilled,
    source,
  });

  return {
    orderId,
    skipped: false,
    welcomeSent,
    welcomeSkipped,
    welcomeError,
    prodRealMarked,
    recipientEmail: email,
    recipientSource: resolution.source,
    orderEmailsBackfilled,
  };
}

/** Best-effort: no lanza hacia el webhook MP. */
export async function runClientPanelPostCreditBestEffort(
  orderId: string,
): Promise<void> {
  try {
    await runClientPanelPostCreditSideEffects(orderId, {
      source: "mercadopago_webhook",
    });
  } catch (err) {
    console.error(
      "[client-panel-post-credit] unexpected",
      orderId,
      err instanceof Error ? err.message : err,
    );
  }
}
