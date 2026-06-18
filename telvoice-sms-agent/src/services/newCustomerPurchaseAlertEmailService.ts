import { env } from "../config/env.js";
import { getSupabase } from "../database/supabaseClient.js";
import type { SmsOrderRow } from "../types/wallet.js";
import { isMissingTableError } from "../utils/db-table.js";
import {
  emailLooksQa,
  normalizeAuditEmail,
  orderLooksQa,
} from "./adminDataAuditClassifier.js";
import { isExplicitTestPurchaseEmail } from "./adminProductionScopeService.js";
import { getInvoiceByOrderId } from "./billingInvoiceService.js";
import { findCompanyById } from "./companyService.js";
import { getOrderWithDetails } from "./smsOrderService.js";
import { getCompanyBalance } from "./smsWalletService.js";
import {
  sendTransactionalEmail,
} from "./transactionalEmailService.js";
import {
  orderRefLabel,
  renderNewCustomerPurchaseInternalAlert,
} from "./transactionalEmailTemplates.js";
import {
  isSimAgentBundleOrder,
  isSimCheckoutOrder,
  isSimSubscriptionOrder,
  isWalletSmsCreditOrder,
} from "../utils/order-display.js";

export const NEW_CUSTOMER_PURCHASE_ALERT_TEMPLATE_KEY =
  "new_customer_purchase_internal_alert";

export function newCustomerPurchaseAlertIdempotencyKey(orderId: string): string {
  return `new-customer-purchase-alert:${orderId}`;
}

function parseNotifyEmailList(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,;]/)
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.includes("@")),
    ),
  ];
}

/** Destinatarios internos: NEW_CUSTOMER_NOTIFY_EMAIL → ORDER → BILLING → SUPERADMIN → victor@telvoice.net */
export function resolveNewCustomerNotifyEmails(): string[] {
  const configured =
    process.env.NEW_CUSTOMER_NOTIFY_EMAIL?.trim() ||
    process.env.ORDER_NOTIFY_EMAIL?.trim() ||
    process.env.BILLING_NOTIFY_EMAIL?.trim() ||
    env.admin.superadminEmail?.trim() ||
    "victor@telvoice.net";
  return parseNotifyEmailList(configured);
}

function isQaPurchase(order: SmsOrderRow, email: string): boolean {
  if (isExplicitTestPurchaseEmail(email)) return true;
  if (emailLooksQa(email)) return true;
  if (orderLooksQa(order as unknown as Record<string, unknown>)) return true;
  return false;
}

function isEligibleSmsBagOrder(order: SmsOrderRow): boolean {
  if (!isWalletSmsCreditOrder(order)) return false;
  if (isSimCheckoutOrder(order)) return false;
  if (isSimAgentBundleOrder(order)) return false;
  if (isSimSubscriptionOrder(order)) return false;
  const meta = order.metadata ?? {};
  if (meta.subscription_payment === true) return false;
  if (meta.checkout_mode === "mercadopago_subscription") return false;
  return true;
}

async function countPriorCreditedWalletOrders(
  companyId: string,
  excludeOrderId: string,
): Promise<number> {
  const { count, error } = await getSupabase()
    .from("sms_orders")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("credit_status", "credited")
    .eq("payment_status", "paid")
    .neq("id", excludeOrderId);

  if (error) {
    if (isMissingTableError(error)) return 0;
    console.warn(
      "[new-customer-alert] prior orders count failed",
      error.message,
    );
    return 0;
  }
  return count ?? 0;
}

export type NewCustomerAssessment = {
  shouldAlert: boolean;
  isConfirmedNewCustomer: boolean;
  probableNewCustomer: boolean;
  reason: string;
};

export async function assessNewCustomerPurchaseAlert(
  order: SmsOrderRow,
): Promise<NewCustomerAssessment> {
  const meta = order.metadata ?? {};
  const email = normalizeAuditEmail(
    order.checkout_email ?? order.payer_email ?? "",
  );

  if (!isEligibleSmsBagOrder(order)) {
    return {
      shouldAlert: false,
      isConfirmedNewCustomer: false,
      probableNewCustomer: false,
      reason: "not_sms_wallet_bag",
    };
  }

  if (order.payment_status !== "paid") {
    return {
      shouldAlert: false,
      isConfirmedNewCustomer: false,
      probableNewCustomer: false,
      reason: "not_paid",
    };
  }

  if (order.credit_status !== "credited") {
    return {
      shouldAlert: false,
      isConfirmedNewCustomer: false,
      probableNewCustomer: false,
      reason: "not_credited",
    };
  }

  if (email && isQaPurchase(order, email)) {
    return {
      shouldAlert: false,
      isConfirmedNewCustomer: false,
      probableNewCustomer: false,
      reason: "qa_blocked",
    };
  }

  if (meta.provision_is_new_company === true) {
    return {
      shouldAlert: true,
      isConfirmedNewCustomer: true,
      probableNewCustomer: false,
      reason: "provision_is_new_company",
    };
  }

  if (meta.reconcile_created_company === true) {
    return {
      shouldAlert: true,
      isConfirmedNewCustomer: true,
      probableNewCustomer: false,
      reason: "reconcile_created_company",
    };
  }

  if (meta.new_customer === true) {
    return {
      shouldAlert: true,
      isConfirmedNewCustomer: true,
      probableNewCustomer: false,
      reason: "metadata_new_customer",
    };
  }

  if (order.company_id) {
    const priorCount = await countPriorCreditedWalletOrders(
      order.company_id,
      order.id,
    );
    if (priorCount === 0) {
      return {
        shouldAlert: true,
        isConfirmedNewCustomer: true,
        probableNewCustomer: false,
        reason: "first_credited_wallet_order",
      };
    }
  }

  return {
    shouldAlert: false,
    isConfirmedNewCustomer: false,
    probableNewCustomer: false,
    reason: "existing_customer",
  };
}

function formatOrderStatus(order: SmsOrderRow): string {
  const parts = [
    `Pago: ${order.payment_status}`,
    `Crédito: ${order.credit_status}`,
  ];
  if (order.claim_status) {
    parts.push(`Claim: ${order.claim_status}`);
  }
  return parts.join(" · ");
}

function formatWalletStatus(order: SmsOrderRow, availableSms: number | null): string {
  if (order.credit_status === "credited") {
    return availableSms != null
      ? `Acreditada · saldo ${availableSms.toLocaleString("es-CL")} SMS`
      : "Acreditada";
  }
  return order.credit_status;
}

async function hasSentNewCustomerPurchaseAlert(
  idempotencyKey: string,
  recipientEmail: string,
): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("email_logs")
    .select("id")
    .eq("template_key", NEW_CUSTOMER_PURCHASE_ALERT_TEMPLATE_KEY)
    .eq("recipient_email", recipientEmail)
    .filter("metadata->>idempotency_key", "eq", idempotencyKey)
    .in("status", ["sent", "pending"])
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return false;
    console.warn("[new-customer-alert] idempotency check failed", error.message);
    return false;
  }
  return Boolean(data);
}

/** Best-effort: no lanza hacia el webhook MP ni bloquea acreditación. */
export async function sendNewCustomerPurchaseAlertEmailBestEffort(
  orderId: string,
): Promise<{ sent: boolean; skipped?: boolean; reason?: string }> {
  try {
    const order = await getOrderWithDetails(orderId);
    if (!order) {
      return { sent: false, skipped: true, reason: "order_not_found" };
    }

    const assessment = await assessNewCustomerPurchaseAlert(order);
    if (!assessment.shouldAlert) {
      return { sent: false, skipped: true, reason: assessment.reason };
    }

    const company = order.company_id
      ? await findCompanyById(order.company_id)
      : null;
    const meta = order.metadata ?? {};
    const invoice = await getInvoiceByOrderId(orderId);

    let availableSms: number | null = null;
    if (order.company_id && order.credit_status === "credited") {
      try {
        const balance = await getCompanyBalance(order.company_id);
        availableSms = balance.availableSms;
      } catch {
        availableSms = null;
      }
    }

    const adminBase = (
      env.publicAdminUrl ||
      env.publicAppUrl ||
      "https://admin.telvoice.cl"
    ).replace(/\/$/, "");

    const companyName =
      (typeof meta.company_name === "string" && meta.company_name.trim()) ||
      company?.name?.trim() ||
      company?.legal_name?.trim() ||
      "Cliente Telvoice";

    const buyerEmail = normalizeAuditEmail(
      order.checkout_email ?? order.payer_email ?? company?.billing_email ?? "",
    );

    const rendered = renderNewCustomerPurchaseInternalAlert({
      companyName,
      buyerEmail: buyerEmail || "—",
      whatsapp:
        typeof meta.phone === "string" && meta.phone.trim()
          ? meta.phone.trim()
          : company?.contact_phone?.trim() || "—",
      taxId:
        typeof meta.tax_id === "string" && meta.tax_id.trim()
          ? meta.tax_id.trim()
          : company?.rut?.trim() || "—",
      legalName: company?.legal_name?.trim() || companyName,
      packageName: order.package_name ?? "Bolsa SMS",
      smsQuantity: order.sms_quantity,
      netAmount: invoice?.subtotal_amount ?? order.amount,
      taxAmount: invoice?.tax_amount ?? 0,
      totalAmount: invoice?.total_amount ?? order.amount,
      currency: order.currency ?? "CLP",
      orderStatusLabel: formatOrderStatus(order),
      walletStatusLabel: formatWalletStatus(order, availableSms),
      orderRef: orderRefLabel(order.id, order.public_checkout_reference),
      orderId: order.id,
      mercadoPagoPaymentId:
        typeof meta.mercadopago_payment_id === "string"
          ? meta.mercadopago_payment_id
          : null,
      purchasedAt: order.credited_at ?? order.updated_at,
      isConfirmedNewCustomer: assessment.isConfirmedNewCustomer,
      probableNewCustomer: assessment.probableNewCustomer,
      adminClientUrl: order.company_id
        ? `${adminBase}/admin/clients?q=${encodeURIComponent(buyerEmail || companyName)}`
        : `${adminBase}/admin/clients`,
      adminOrderUrl: `${adminBase}/admin/orders/${order.id}`,
    });

    const idempotencyKey = newCustomerPurchaseAlertIdempotencyKey(orderId);
    const recipients = resolveNewCustomerNotifyEmails();
    if (recipients.length === 0) {
      return { sent: false, skipped: true, reason: "no_recipients" };
    }

    let anySent = false;
    for (const recipientEmail of recipients) {
      const recipientKey = `${idempotencyKey}:${recipientEmail}`;
      if (await hasSentNewCustomerPurchaseAlert(recipientKey, recipientEmail)) {
        continue;
      }

      const result = await sendTransactionalEmail({
        templateKey: NEW_CUSTOMER_PURCHASE_ALERT_TEMPLATE_KEY,
        subject: rendered.subject,
        recipientEmail,
        html: rendered.html,
        text: rendered.text,
        orderId,
        companyId: order.company_id,
        skipIdempotency: true,
        metadata: {
          idempotency_key: recipientKey,
          alert_reason: assessment.reason,
          is_confirmed_new_customer: assessment.isConfirmedNewCustomer,
          probable_new_customer: assessment.probableNewCustomer,
          admin_order_url: `${adminBase}/admin/orders/${order.id}`,
        },
      });
      if (result.ok && !result.skipped) {
        anySent = true;
      }
    }

    console.log(
      JSON.stringify({
        event: "new_customer_purchase_alert.completed",
        at: new Date().toISOString(),
        orderId,
        companyId: order.company_id,
        sent: anySent,
        reason: assessment.reason,
        recipients: recipients.length,
      }),
    );

    return anySent
      ? { sent: true }
      : { sent: false, skipped: true, reason: "all_recipients_skipped" };
  } catch (err) {
    console.warn(
      "[new-customer-alert] failed",
      orderId,
      err instanceof Error ? err.message : err,
    );
    return { sent: false, skipped: true, reason: "error" };
  }
}
