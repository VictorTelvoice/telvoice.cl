import { markEntityAsProdReal } from "./adminDataAuditService.js";
import { runBillingSyncBestEffort } from "./billingSyncService.js";
import { provisionCompanyFromCheckout } from "./checkoutAccountProvisionService.js";
import { confirmOrderCredit, getOrderById } from "./smsOrderService.js";
import {
  sendCheckoutPanelAccessEmail,
  sendPostClaimEmailsBestEffort,
} from "./transactionalEmailService.js";

export type LandingSmsAutoCreditResult = {
  result: string;
  companyId?: string;
};

export async function processLandingSmsBagAutoCredit(
  orderId: string,
): Promise<LandingSmsAutoCreditResult> {
  const order = await getOrderById(orderId);
  if (!order) {
    return { result: "order_not_found" };
  }

  if (order.credit_status === "credited") {
    return { result: "already_credited", companyId: order.company_id ?? undefined };
  }

  const checkoutEmail =
    order.checkout_email?.trim() ||
    (typeof order.metadata?.checkout_email === "string"
      ? order.metadata.checkout_email.trim()
      : "");
  if (!checkoutEmail) {
    console.error("[landing-sms-post-pay] missing checkout email", orderId);
    return { result: "missing_checkout_email" };
  }

  let companyId: string;
  let isNewCompany = false;

  try {
    const provision = await provisionCompanyFromCheckout({
      order,
      checkoutEmail,
      payerName:
        typeof order.metadata?.payer_name === "string"
          ? order.metadata.payer_name
          : undefined,
      companyName:
        typeof order.metadata?.company_name === "string"
          ? order.metadata.company_name
          : undefined,
      phone:
        typeof order.metadata?.phone === "string" ? order.metadata.phone : undefined,
      taxId:
        typeof order.metadata?.tax_id === "string" ? order.metadata.tax_id : undefined,
      useCase:
        typeof order.metadata?.use_case === "string"
          ? order.metadata.use_case
          : undefined,
      provisionSource: "landing_sms_checkout",
    });
    companyId = provision.companyId;
    isNewCompany = provision.isNewCompany;
  } catch (err) {
    console.error("[landing-sms-post-pay] provision failed", orderId, err);
    return { result: "provision_failed" };
  }

  try {
    await confirmOrderCredit(orderId, null, {
      ratePlanSource: "mercadopago_webhook",
    });
  } catch (err) {
    console.error("[landing-sms-post-pay] credit failed", orderId, err);
    return { result: "credit_failed", companyId };
  }

  await runBillingSyncBestEffort(orderId, { source: "mercadopago_webhook" });

  try {
    await markEntityAsProdReal({
      entityType: "company",
      entityId: companyId,
      reason: "Compra landing SMS acreditada (Mercado Pago)",
      protected: false,
    });
    await markEntityAsProdReal({
      entityType: "sms_order",
      entityId: orderId,
      reason: "Orden landing SMS pagada y acreditada",
      protected: false,
    });
  } catch (err) {
    console.error("[landing-sms-post-pay] prod_real mark failed", orderId, err);
  }

  try {
    await sendPostClaimEmailsBestEffort(orderId);
    if (isNewCompany) {
      await sendCheckoutPanelAccessEmail(orderId, checkoutEmail);
    }
  } catch (err) {
    console.error("[landing-sms-post-pay] emails failed", orderId, err);
  }

  console.log("[landing-sms-post-pay] auto credited", orderId, companyId);
  return { result: "paid_auto_credited", companyId };
}
