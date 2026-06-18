import { getSupabase } from "../database/supabaseClient.js";
import { getMercadoPagoPayment, getMercadoPagoPreapproval } from "./mercadoPagoService.js";
import {
  isClientPanelMercadoPagoOrder,
  loadOrderForWebhook,
} from "./mercadoPagoClientPanelService.js";
import {
  confirmOrderCredit,
  createOrder,
  getOrderById,
  markOrderPaid,
  patchOrderFields,
} from "./smsOrderService.js";
import {
  CLIENT_PANEL_ORDER_METADATA,
  isPublicCheckoutOrder,
} from "../utils/order-display.js";
import {
  sendSimAgentBundlePaymentEmails,
  sendSimPaymentReceivedEmails,
  sendCheckoutPanelAccessEmail,
} from "./transactionalEmailService.js";
import { processLandingSmsBagAutoCredit } from "./landingSmsPostPaymentService.js";
import { hasPurchaseCreditForOrder } from "./walletTransactionService.js";
import {
  isSimAgentBundleOrder,
  isSimCheckoutOrder,
  isSimSubscriptionOrder,
  isWalletSmsCreditOrder,
} from "../utils/order-display.js";
import {
  createSimActivationRequest,
  linkSimActivationInventory,
  markSimActivationPaidPending,
  processSimPostPaymentActivation,
} from "./simActivationService.js";
import { getSimPlan, getBundledAgentAddonForSimPlan } from "../utils/simPlans.js";
import { getAgentAddon } from "../utils/agentAddons.js";
import {
  markNumberPaymentApproved,
  releaseReservationForOrder,
} from "./realNumberInventoryService.js";
import { provisionCompanyFromCheckout } from "./checkoutAccountProvisionService.js";
import { createAgentPlanRequestFromCheckout } from "./clientAgentPlanService.js";
import { syncPaymentCardFromOrderMetadata } from "./companyPaymentCardService.js";
import {
  findSubscriptionByExternalReference,
  findSubscriptionByPreapprovalId,
  recordSubscriptionPayment,
  updateSmsMpSubscriptionStatus,
} from "./smsMpSubscriptionService.js";
import {
  applySimSubscriptionPreapprovalWebhook,
  getSimSubscriptionByOrderId,
  getSimSubscriptionByPreapprovalId,
  processSimSubscriptionMercadoPagoPayment,
  syncSimSubscriptionAfterOrderFirstPayment,
} from "./simSubscriptionService.js";
import { runBillingSyncBestEffort } from "./billingSyncService.js";
import { runClientPanelPostCreditBestEffort } from "./clientPanelPostPurchaseService.js";
import { sendNewCustomerPurchaseAlertEmailBestEffort } from "./newCustomerPurchaseAlertEmailService.js";
import type { MercadoPagoPaymentRecord } from "./mercadoPagoService.js";
import type { SmsOrderRow } from "../types/wallet.js";

function mergeMpMetadata(
  order: { metadata?: Record<string, unknown> },
  payment: MercadoPagoPaymentRecord,
): Record<string, unknown> {
  const now = new Date().toISOString();
  const prev = order.metadata ?? {};
  const approved = payment.status === "approved";

  return {
    ...prev,
    mercadopago_payment_id: String(payment.id),
    mercadopago_status: payment.status,
    mercadopago_status_detail: payment.status_detail ?? null,
    mercadopago_payment_method_id: payment.payment_method_id ?? null,
    mercadopago_webhook_at: now,
    mercadopago_amount:
      payment.transaction_amount != null
        ? Math.round(Number(payment.transaction_amount))
        : prev.mercadopago_amount ?? null,
    mercadopago_currency: payment.currency_id ?? prev.mercadopago_currency ?? null,
    ...(approved ? { mercadopago_processed_at: now } : {}),
  };
}

async function syncCreditedOrderState(
  orderId: string,
  order: SmsOrderRow,
  metaPatch: Record<string, unknown>,
): Promise<SmsOrderRow> {
  if (order.credit_status !== "credited") {
    const refreshed = await getOrderById(orderId);
    if (refreshed?.credit_status === "credited") {
      await patchOrderFields(orderId, { metadata: metaPatch });
      return refreshed;
    }
    await patchOrderFields(orderId, {
      payment_status: order.payment_status === "pending" ? "paid" : order.payment_status,
      credit_status: "credited",
      credited_at: new Date().toISOString(),
      metadata: metaPatch,
    });
    const afterSync = await getOrderById(orderId);
    return afterSync ?? order;
  }
  await patchOrderFields(orderId, { metadata: metaPatch });
  const latest = await getOrderById(orderId);
  return latest ?? order;
}

async function resolveAlreadyCredited(
  orderId: string,
  order: SmsOrderRow,
  metaPatch: Record<string, unknown>,
): Promise<{ handled: true; orderId: string; result: "already_credited" }> {
  if (order.credit_status === "credited") {
    await patchOrderFields(orderId, { metadata: metaPatch });
    console.log("[mp-webhook] already_credited (orden acreditada)", orderId);
    await runBillingSyncBestEffort(orderId, { source: "mercadopago_webhook" });
    await runClientPanelPostCreditBestEffort(orderId);
    return { handled: true, orderId, result: "already_credited" };
  }

  const hasTx = await hasPurchaseCreditForOrder(orderId);
  if (hasTx) {
    await syncCreditedOrderState(orderId, order, metaPatch);
    console.log("[mp-webhook] already_credited (purchase_credit existente)", orderId);
    await runBillingSyncBestEffort(orderId, { source: "mercadopago_webhook" });
    await runClientPanelPostCreditBestEffort(orderId);
    return { handled: true, orderId, result: "already_credited" };
  }

  return { handled: true, orderId, result: "already_credited" };
}

async function creditApprovedOrder(
  orderId: string,
  order: SmsOrderRow,
  metaPatch: Record<string, unknown>,
): Promise<{ handled: true; orderId: string; result: string }> {
  const early = await resolveAlreadyCreditedIfApplicable(orderId, order, metaPatch);
  if (early) {
    return early;
  }

  if (order.payment_status !== "paid") {
    await markOrderPaid(orderId, null);
  }

  const credit = await confirmOrderCredit(orderId, null, {
    allowManualWithoutPaid: false,
  });

  await patchOrderFields(orderId, { metadata: metaPatch });

  const result = credit.alreadyCredited ? "already_credited" : "credited";
  if (credit.alreadyCredited) {
    console.log("[mp-webhook] already_credited (confirmOrderCredit)", orderId);
  } else {
    console.log("[mp-webhook] credited", orderId);
  }

  await runBillingSyncBestEffort(orderId, { source: "mercadopago_webhook" });
  await runClientPanelPostCreditBestEffort(orderId);
  await sendNewCustomerPurchaseAlertEmailBestEffort(orderId);

  return { handled: true, orderId, result };
}

async function resolveAlreadyCreditedIfApplicable(
  orderId: string,
  order: SmsOrderRow,
  metaPatch: Record<string, unknown>,
): Promise<{ handled: true; orderId: string; result: "already_credited" } | null> {
  if (order.credit_status === "credited") {
    return resolveAlreadyCredited(orderId, order, metaPatch);
  }
  if (await hasPurchaseCreditForOrder(orderId)) {
    return resolveAlreadyCredited(orderId, order, metaPatch);
  }
  return null;
}

export async function processClientPanelMercadoPagoWebhook(
  paymentId: string,
): Promise<{ handled: boolean; orderId?: string; result?: string }> {
  const payment = await getMercadoPagoPayment(paymentId);
  const orderId = payment.external_reference?.trim();
  if (!orderId) {
    console.warn("[mp-webhook] payment sin external_reference", paymentId);
    return { handled: false };
  }

  const order = await loadOrderForWebhook(orderId);
  if (!order) {
    return { handled: false };
  }

  const metaPatch = mergeMpMetadata(order, payment);

  if (payment.status === "approved") {
    const paidAmount = Math.round(Number(payment.transaction_amount ?? 0));
    const expected = Math.round(Number(order.amount));
    if (payment.currency_id && payment.currency_id !== "CLP") {
      console.warn("[mp-webhook] moneda inválida", payment.currency_id, orderId);
      await patchOrderFields(orderId, { metadata: metaPatch });
      return { handled: true, orderId, result: "invalid_currency" };
    }
    if (paidAmount !== expected) {
      console.warn(
        "[mp-webhook] monto no coincide",
        paidAmount,
        expected,
        orderId,
      );
      await patchOrderFields(orderId, { metadata: metaPatch });
      return { handled: true, orderId, result: "amount_mismatch" };
    }

    const creditResult = await creditApprovedOrder(orderId, order, metaPatch);
    if (order.company_id) {
      await syncPaymentCardFromOrderMetadata(
        order.company_id,
        order.metadata,
        payment,
      );
    }
    return creditResult;
  }

  if (payment.status === "rejected") {
    await patchOrderFields(orderId, {
      payment_status: "rejected",
      metadata: metaPatch,
    });
    return { handled: true, orderId, result: "rejected" };
  }

  if (payment.status === "cancelled") {
    await patchOrderFields(orderId, {
      payment_status: "cancelled",
      metadata: metaPatch,
    });
    return { handled: true, orderId, result: "cancelled" };
  }

  await patchOrderFields(orderId, { metadata: metaPatch });
  return { handled: true, orderId, result: payment.status };
}

export async function processPublicCheckoutMercadoPagoWebhook(
  paymentId: string,
): Promise<{ handled: boolean; orderId?: string; result?: string }> {
  const payment = await getMercadoPagoPayment(paymentId);
  const orderId = payment.external_reference?.trim();
  if (!orderId) {
    return { handled: false };
  }

  const order = await getOrderById(orderId);
  if (!order || !isPublicCheckoutOrder(order)) {
    return { handled: false };
  }

  const metaPatch = mergeMpMetadata(order, payment);

  const isSim = isSimCheckoutOrder(order);
  const isBundle = isSimAgentBundleOrder(order);

  if (payment.status === "approved") {
    const paidAmount = Math.round(Number(payment.transaction_amount ?? 0));
    const expected = Math.round(Number(order.amount));
    if (payment.currency_id && payment.currency_id !== "CLP") {
      await patchOrderFields(orderId, { metadata: metaPatch });
      return { handled: true, orderId, result: "invalid_currency" };
    }
    if (paidAmount !== expected) {
      await patchOrderFields(orderId, { metadata: metaPatch });
      return { handled: true, orderId, result: "amount_mismatch" };
    }

    const latestBefore = await getOrderById(orderId);

    if (
      payment.status === "approved" &&
      latestBefore?.payment_status === "paid" &&
      String(latestBefore.metadata?.mercadopago_payment_id ?? "") === String(payment.id)
    ) {
      await patchOrderFields(orderId, { metadata: metaPatch });
      if (isSim || isBundle) {
        try {
          const postPay = await processSimPostPaymentActivation(orderId);
          console.log(
            "[mp-webhook] sim post-payment retry",
            orderId,
            postPay.autoActivated ? "auto_activated" : postPay.reason ?? "pending",
          );
        } catch (err) {
          console.error("[mp-webhook] sim post-payment retry failed", orderId, err);
        }
        return {
          handled: true,
          orderId,
          result: isBundle
            ? "sim_agent_bundle_payment_already_processed"
            : "sim_payment_already_processed",
        };
      }
      if (latestBefore.credit_status !== "credited") {
        const autoCredit = await processLandingSmsBagAutoCredit(orderId);
        return { handled: true, orderId, result: autoCredit.result };
      }
      return { handled: true, orderId, result: "landing_payment_already_processed" };
    }

    // Seguridad: si la orden fue cancelada, no debemos marcarla como pagada
    // aunque MercadoPago envíe un webhook "approved".
    // Esto evita activaciones/provisioning sobre órdenes QA canceladas.
    if (latestBefore?.payment_status === "pending") {
      await markOrderPaid(orderId, null);
    }

    if (!isSim) {
      if (latestBefore?.credit_status === "credited") {
        await patchOrderFields(orderId, { metadata: metaPatch });
        return { handled: true, orderId, result: "already_credited" };
      }
      await patchOrderFields(orderId, { metadata: metaPatch });
      const autoCredit = await processLandingSmsBagAutoCredit(orderId);
      return { handled: true, orderId, result: autoCredit.result };
    }

    if (latestBefore?.metadata?.activation_status === "paid_pending_activation") {
      await patchOrderFields(orderId, { metadata: metaPatch });
      return { handled: true, orderId, result: "sim_already_pending_activation" };
    }

    const simMetaPatch = {
      ...metaPatch,
      activation_status: "paid_pending_activation",
    };

    await patchOrderFields(orderId, {
      credit_status: isBundle ? "pending" : "pending_claim",
      metadata: simMetaPatch,
    });

    if (isSim) {
      const refreshed = await getOrderById(orderId);
      const planId = String(
        refreshed?.metadata?.sim_plan_id ??
          refreshed?.metadata?.plan_id ??
          "",
      );
      const plan = getSimPlan(planId);
      const inventoryNumberId =
        refreshed?.metadata?.inventory_number_id != null
          ? String(refreshed.metadata.inventory_number_id)
          : null;

      if (plan) {
        const activation = await createSimActivationRequest({
          orderId,
          plan,
          checkoutEmail:
            refreshed?.checkout_email ??
            String(refreshed?.metadata?.checkout_email ?? ""),
          payerName:
            typeof refreshed?.metadata?.payer_name === "string"
              ? refreshed.metadata.payer_name
              : undefined,
          companyName:
            typeof refreshed?.metadata?.company_name === "string"
              ? refreshed.metadata.company_name
              : undefined,
          phone:
            typeof refreshed?.metadata?.phone === "string"
              ? refreshed.metadata.phone
              : undefined,
          taxId:
            typeof refreshed?.metadata?.tax_id === "string"
              ? refreshed.metadata.tax_id
              : undefined,
          useCase:
            typeof refreshed?.metadata?.use_case === "string"
              ? refreshed.metadata.use_case
              : undefined,
          activationStatus: "paid_pending_activation",
          inventoryNumberId: inventoryNumberId ?? undefined,
        });

        if (inventoryNumberId) {
          await markNumberPaymentApproved({
            orderId,
            simActivationRequestId: activation.id,
          });
          await linkSimActivationInventory(orderId, inventoryNumberId);
        }
      } else if (inventoryNumberId) {
        await markNumberPaymentApproved({ orderId });
      }
      await markSimActivationPaidPending(orderId);

      if (isBundle && refreshed) {
        const checkoutEmail =
          refreshed.checkout_email ??
          String(refreshed.metadata?.checkout_email ?? "");
        const bundledAgentId = plan
          ? getBundledAgentAddonForSimPlan(plan.plan_id)
          : String(refreshed.metadata?.agent_addon_id ?? "agent_pro");

        const provision = await provisionCompanyFromCheckout({
          order: refreshed,
          checkoutEmail,
          payerName:
            typeof refreshed.metadata?.payer_name === "string"
              ? refreshed.metadata.payer_name
              : undefined,
          companyName:
            typeof refreshed.metadata?.company_name === "string"
              ? refreshed.metadata.company_name
              : undefined,
          phone:
            typeof refreshed.metadata?.phone === "string"
              ? refreshed.metadata.phone
              : undefined,
          taxId:
            typeof refreshed.metadata?.tax_id === "string"
              ? refreshed.metadata.tax_id
              : undefined,
          useCase:
            typeof refreshed.metadata?.use_case === "string"
              ? refreshed.metadata.use_case
              : undefined,
        });

        const addon = getAgentAddon(bundledAgentId);
        if (addon?.planCode) {
          await createAgentPlanRequestFromCheckout({
            companyId: provision.companyId,
            orderId,
            planCode: addon.planCode,
            checkoutEmail,
            useCase:
              typeof refreshed.metadata?.use_case === "string"
                ? refreshed.metadata.use_case
                : undefined,
          });
        }

        const afterProvision = await getOrderById(orderId);
        if (afterProvision?.company_id && isWalletSmsCreditOrder(afterProvision)) {
          try {
            const credit = await confirmOrderCredit(orderId, null);
            console.log(
              "[mp-webhook] sim bundle wallet credit",
              orderId,
              credit.alreadyCredited ? "already_credited" : "credited",
            );
          } catch (err) {
            console.error("[mp-webhook] sim bundle wallet credit failed", orderId, err);
          }
        }

        try {
          await sendSimAgentBundlePaymentEmails(orderId);
          if (provision.isNewCompany) {
            await sendCheckoutPanelAccessEmail(orderId, checkoutEmail);
          }
          const postPay = await processSimPostPaymentActivation(orderId);
          console.log(
            "[mp-webhook] sim post-payment",
            orderId,
            postPay.autoActivated ? "auto_activated" : postPay.reason ?? "pending",
          );
        } catch (err) {
          console.error("[mp-webhook] sim agent bundle email failed", orderId, err);
        }

        return { handled: true, orderId, result: "sim_agent_bundle_paid_pending_activation" };
      }

      if (
        refreshed &&
        isSimSubscriptionOrder(refreshed) &&
        inventoryNumberId
      ) {
        const checkoutEmail =
          refreshed.checkout_email ??
          String(refreshed.metadata?.checkout_email ?? "");
        const bundledAgentId = plan
          ? getBundledAgentAddonForSimPlan(plan.plan_id)
          : String(refreshed.metadata?.agent_addon_id ?? "agent_start");

        const provision = await provisionCompanyFromCheckout({
          order: refreshed,
          checkoutEmail,
          payerName:
            typeof refreshed.metadata?.payer_name === "string"
              ? refreshed.metadata.payer_name
              : undefined,
          companyName:
            typeof refreshed.metadata?.company_name === "string"
              ? refreshed.metadata.company_name
              : undefined,
          phone:
            typeof refreshed.metadata?.phone === "string"
              ? refreshed.metadata.phone
              : undefined,
          taxId:
            typeof refreshed.metadata?.tax_id === "string"
              ? refreshed.metadata.tax_id
              : undefined,
        });

        const addon = getAgentAddon(bundledAgentId);
        if (addon?.planCode) {
          await createAgentPlanRequestFromCheckout({
            companyId: provision.companyId,
            orderId,
            planCode: addon.planCode,
            checkoutEmail,
          });
        }

        const afterProvision = await getOrderById(orderId);
        if (afterProvision?.company_id) {
          try {
            const paymentId = String(payment.id ?? metaPatch.mercadopago_payment_id ?? "");
            await syncSimSubscriptionAfterOrderFirstPayment(orderId, paymentId);
            console.log("[mp-webhook] sim subscription month-1 credit", orderId);
          } catch (err) {
            console.error(
              "[mp-webhook] sim subscription month-1 credit failed",
              orderId,
              err,
            );
          }
        }

        try {
          await sendSimAgentBundlePaymentEmails(orderId);
          if (provision.isNewCompany) {
            await sendCheckoutPanelAccessEmail(orderId, checkoutEmail);
          }
          const postPay = await processSimPostPaymentActivation(orderId);
          console.log(
            "[mp-webhook] sim subscription post-payment",
            orderId,
            postPay.autoActivated ? "auto_activated" : postPay.reason ?? "pending",
          );
        } catch (err) {
          console.error("[mp-webhook] sim subscription email failed", orderId, err);
        }

        return {
          handled: true,
          orderId,
          result: "sim_subscription_paid_pending_activation",
        };
      }

      try {
        await sendSimPaymentReceivedEmails(orderId);
      } catch (err) {
        console.error("[mp-webhook] sim payment email failed", orderId, err);
      }

      if (refreshed?.company_id) {
        try {
          const postPay = await processSimPostPaymentActivation(orderId);
          console.log(
            "[mp-webhook] sim post-payment",
            orderId,
            postPay.autoActivated ? "auto_activated" : postPay.reason ?? "pending",
          );
        } catch (err) {
          console.error("[mp-webhook] sim post-payment failed", orderId, err);
        }
      }

      return { handled: true, orderId, result: "sim_paid_pending_activation" };
    }
  }

  if (payment.status === "rejected") {
    await patchOrderFields(orderId, {
      payment_status: "rejected",
      metadata: metaPatch,
    });
    if (isSim || isBundle) {
      await releaseReservationForOrder(orderId);
    }
    return { handled: true, orderId, result: "rejected" };
  }

  if (payment.status === "cancelled") {
    await patchOrderFields(orderId, {
      payment_status: "cancelled",
      metadata: metaPatch,
    });
    if (isSim || isBundle) {
      await releaseReservationForOrder(orderId);
    }
    return { handled: true, orderId, result: "cancelled" };
  }

  await patchOrderFields(orderId, { metadata: metaPatch });
  return { handled: true, orderId, result: payment.status };
}

/** Ignora pagos cuyo external_reference no es orden del panel (landing u otros). */
function subscriptionRefFromPayment(
  payment: MercadoPagoPaymentRecord & { preapproval_id?: string },
): string | null {
  const meta = payment.metadata ?? {};
  const fromMeta =
    typeof meta.subscription_id === "string" ? meta.subscription_id.trim() : "";
  if (fromMeta) {
    return fromMeta;
  }
  const ext = payment.external_reference?.trim();
  if (ext) {
    return ext;
  }
  const pre = payment.preapproval_id?.trim();
  return pre || null;
}

export async function processMercadoPagoPreapprovalWebhook(
  preapprovalId: string,
): Promise<{ ok: boolean; result?: string; subscriptionId?: string; orderId?: string }> {
  const pre = await getMercadoPagoPreapproval(preapprovalId);
  const ref = pre.external_reference?.trim();
  if (!ref) {
    return { ok: true, result: "no_external_reference" };
  }

  const simOrder = await getOrderById(ref);
  if (simOrder && isSimSubscriptionOrder(simOrder)) {
    await applyPublicSimSubscriptionPreapprovalStatus(simOrder, pre);
    return { ok: true, orderId: simOrder.id, result: pre.status };
  }

  const found = await findSubscriptionByExternalReference(ref);
  if (!found) {
    const byMp = await findSubscriptionByPreapprovalId(preapprovalId);
    if (!byMp) {
      const byOrderPreapproval = await findSimSubscriptionOrderByPreapprovalId(preapprovalId);
      if (byOrderPreapproval) {
        await applyPublicSimSubscriptionPreapprovalStatus(byOrderPreapproval, pre);
        return { ok: true, orderId: byOrderPreapproval.id, result: pre.status };
      }
      return { ok: true, result: "subscription_not_found" };
    }
    await applyPreapprovalStatus(byMp.companyId, byMp.subscription.id, pre);
    return { ok: true, subscriptionId: byMp.subscription.id, result: pre.status };
  }

  await applyPreapprovalStatus(found.companyId, found.subscription.id, pre);
  return { ok: true, subscriptionId: found.subscription.id, result: pre.status };
}

async function findSimSubscriptionOrderByPreapprovalId(
  preapprovalId: string,
): Promise<Awaited<ReturnType<typeof getOrderById>>> {
  const { data, error } = await getSupabase()
    .from("sms_orders")
    .select("*")
    .eq("payment_reference", preapprovalId)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  const order = data as NonNullable<Awaited<ReturnType<typeof getOrderById>>>;
  return isSimSubscriptionOrder(order) ? order : null;
}

async function applyPublicSimSubscriptionPreapprovalStatus(
  order: NonNullable<Awaited<ReturnType<typeof getOrderById>>>,
  pre: { status?: string; id?: string },
): Promise<void> {
  const status = (pre.status ?? "").toLowerCase();
  const subscription =
    (await getSimSubscriptionByOrderId(order.id)) ??
    (pre.id ? await getSimSubscriptionByPreapprovalId(pre.id) : null);

  if (subscription) {
    await applySimSubscriptionPreapprovalWebhook({
      subscription,
      preapprovalStatus: status,
      preapprovalId: pre.id ?? null,
    });
  }

  const metaPatch = {
    ...(order.metadata ?? {}),
    mercadopago_preapproval_id: pre.id ?? order.metadata?.mercadopago_preapproval_id ?? null,
    subscription_status: status || "pending",
    mercadopago_preapproval_webhook_at: new Date().toISOString(),
  };

  if (status === "cancelled") {
    await patchOrderFields(order.id, {
      payment_status: "cancelled",
      metadata: {
        ...metaPatch,
        checkout_cancel_reason: "mp_preapproval_cancelled",
      },
    });
    await releaseReservationForOrder(order.id);
    return;
  }

  if (status === "paused") {
    await patchOrderFields(order.id, { metadata: metaPatch });
    return;
  }

  if (status === "authorized") {
    await patchOrderFields(order.id, {
      metadata: {
        ...metaPatch,
        subscription_status: "authorized",
      },
    });
  }
}

async function applyPreapprovalStatus(
  companyId: string,
  subscriptionId: string,
  pre: { status?: string; id?: string },
): Promise<void> {
  const status = (pre.status ?? "").toLowerCase();
  if (status === "authorized") {
    await updateSmsMpSubscriptionStatus({
      companyId,
      subscriptionId,
      status: "authorized",
      mpPreapprovalId: pre.id ?? null,
    });
    return;
  }
  if (status === "paused") {
    await updateSmsMpSubscriptionStatus({
      companyId,
      subscriptionId,
      status: "paused",
      mpPreapprovalId: pre.id ?? null,
    });
    return;
  }
  if (status === "cancelled") {
    await updateSmsMpSubscriptionStatus({
      companyId,
      subscriptionId,
      status: "cancelled",
      mpPreapprovalId: pre.id ?? null,
    });
  }
}

export async function processSubscriptionMercadoPagoPayment(
  paymentId: string,
): Promise<{ handled: boolean; orderId?: string; result?: string }> {
  const payment = await getMercadoPagoPayment(paymentId);
  if (payment.status !== "approved") {
    return { handled: false };
  }

  const ref = subscriptionRefFromPayment(
    payment as MercadoPagoPaymentRecord & { preapproval_id?: string },
  );
  if (!ref) {
    return { handled: false };
  }

  let found = await findSubscriptionByExternalReference(ref);
  if (!found) {
    const preId =
      (payment as { preapproval_id?: string }).preapproval_id?.trim() ?? ref;
    found = await findSubscriptionByPreapprovalId(preId);
  }
  if (!found) {
    return { handled: false };
  }

  const { companyId, subscription } = found;
  const paidAmount = Math.round(Number(payment.transaction_amount ?? 0));
  if (paidAmount !== subscription.monthlyAmount) {
    console.warn(
      "[mp-webhook] suscripción monto distinto",
      paidAmount,
      subscription.monthlyAmount,
      subscription.id,
    );
    return { handled: true, result: "amount_mismatch" };
  }

  const payRef = `MP-SUB-${paymentId}`;
  const { data: existing } = await getSupabase()
    .from("sms_orders")
    .select("id, credit_status")
    .eq("payment_reference", payRef)
    .maybeSingle();

  if (existing?.credit_status === "credited") {
    return { handled: true, orderId: existing.id as string, result: "already_credited" };
  }

  let orderId: string;
  if (existing?.id) {
    orderId = String(existing.id);
  } else {
    const created = await createOrder({
      companyId,
      packageId: subscription.packageId,
      paymentProvider: "mercadopago",
      paymentReference: payRef,
      metadata: {
        ...CLIENT_PANEL_ORDER_METADATA,
        checkout_mode: "mercadopago_subscription",
        subscription_id: subscription.id,
        subscription_payment: true,
        mercadopago_payment_id: String(payment.id),
        mercadopago_preapproval_id: subscription.mpPreapprovalId,
      },
    });
    orderId = created.id;
  }

  const orderRow = await getOrderById(orderId);
  if (!orderRow) {
    return { handled: false };
  }

  const metaPatch = mergeMpMetadata(orderRow, payment);
  const creditResult = await creditApprovedOrder(orderId, orderRow, metaPatch);
  await recordSubscriptionPayment({
    companyId,
    subscriptionId: subscription.id,
    orderId,
  });
  await syncPaymentCardFromOrderMetadata(companyId, orderRow.metadata, payment);

  return creditResult;
}

export async function routeMercadoPagoWebhook(
  paymentId: string,
): Promise<{ ok: boolean; skipped?: string; orderId?: string; result?: string }> {
  const payment = await getMercadoPagoPayment(paymentId);
  const preapprovalId =
    (payment as { preapproval_id?: string }).preapproval_id?.trim() ?? "";

  if (preapprovalId) {
    const simSub = await processSimSubscriptionMercadoPagoPayment({
      paymentId: String(payment.id ?? paymentId),
      paymentStatus: String(payment.status ?? ""),
      transactionAmount: Number(payment.transaction_amount ?? 0),
      preapprovalId,
      externalReference: payment.external_reference,
    });
    if (simSub.handled && simSub.result !== "delegate_first_payment_to_order_webhook") {
      return {
        ok: true,
        orderId: simSub.orderId,
        result: simSub.result,
      };
    }
  }

  const orderId = payment.external_reference?.trim();
  if (!orderId) {
    const sub = await processSubscriptionMercadoPagoPayment(paymentId);
    if (sub.handled) {
      return {
        ok: true,
        orderId: sub.orderId,
        result: sub.result ?? "subscription_payment",
      };
    }
    return { ok: true, skipped: "no_external_reference" };
  }

  const order = await getOrderById(orderId);
  if (!order) {
    const sub = await processSubscriptionMercadoPagoPayment(paymentId);
    if (sub.handled) {
      return {
        ok: true,
        orderId: sub.orderId,
        result: sub.result ?? "subscription_payment",
      };
    }
    return { ok: true, skipped: "order_not_in_sms_orders" };
  }

  if (isPublicCheckoutOrder(order)) {
    const pub = await processPublicCheckoutMercadoPagoWebhook(paymentId);
    return {
      ok: true,
      orderId: pub.orderId,
      result: pub.result,
    };
  }

  if (!isClientPanelMercadoPagoOrder(order)) {
    return { ok: true, skipped: "not_client_panel_order" };
  }

  const result = await processClientPanelMercadoPagoWebhook(paymentId);
  return {
    ok: true,
    orderId: result.orderId,
    result: result.result,
  };
}
