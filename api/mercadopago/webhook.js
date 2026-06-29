import { getPlan } from "../../lib/plans.js";
import { getSimPlan } from "../../lib/sim-plans.js";
import {
  getOrder,
  updateOrder,
  appendPaymentLog,
} from "../../lib/orders.js";
import { getPayment } from "../../lib/mercadopago.js";
import { sendOrderConfirmationEmails } from "../../lib/email.js";
import {
  extractMercadoPagoSubscriptionWebhookEvent,
  forwardSubscriptionWebhookToAgent,
} from "../../lib/mercadopago-webhook-forward.js";

async function maybeSendConfirmationEmails(order) {
  if (order.confirmation_emails_sent_at) return;
  const emailResult = await sendOrderConfirmationEmails(order);
  if (emailResult.shouldMarkSent) {
    await updateOrder(order.id, {
      confirmation_emails_sent_at: new Date().toISOString(),
    });
  } else if (!emailResult.ok && !emailResult.skipped) {
    console.warn("[webhook] correos no enviados", order.id, emailResult);
  }
}

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function extractPaymentId(req) {
  const q = req.query || {};
  if (q.topic === "payment" && q.id) {
    return String(q.id);
  }
  const body = req.body || {};
  if (body.type === "payment" && body.data && body.data.id) {
    return String(body.data.id);
  }
  if (body.topic === "payment" && body.id) {
    return String(body.id);
  }
  return null;
}

const TERMINAL_ORDER_STATUSES = new Set([
  "paid",
  "activation_pending",
  "activated",
  "rejected",
  "cancelled",
]);

function mapPaymentToOrderStatus(mpStatus) {
  if (mpStatus === "approved") return "activation_pending";
  if (mpStatus === "rejected") return "rejected";
  if (mpStatus === "cancelled") return "cancelled";
  if (mpStatus === "refunded" || mpStatus === "charged_back") return "cancelled";
  return null;
}

function resolveOrderPlan(order) {
  if (order.plan_id === "calc") return { ok: true, plan: null };
  const plan = getPlan(order.plan_id) || getSimPlan(order.plan_id);
  if (!plan || plan.total_amount !== order.total_amount) {
    return { ok: false, plan: null };
  }
  return { ok: true, plan };
}

async function processPayment(paymentId, rawWebhook) {
  const payment = await getPayment(paymentId);
  const externalRef = payment.external_reference;
  if (!externalRef) {
    console.warn("[webhook] payment sin external_reference", paymentId);
    return;
  }

  let order = await getOrder(externalRef);
  if (!order) {
    console.warn("[webhook] orden no encontrada", externalRef);
    return;
  }

  const expectedTotal = order.total_amount;
  const paidAmount = Math.round(Number(payment.transaction_amount));
  const currency = payment.currency_id;

  order = appendPaymentLog(order, {
    type: "webhook",
    payment_id: paymentId,
    status: payment.status,
    status_detail: payment.status_detail,
    raw: rawWebhook,
  });

  if (
    TERMINAL_ORDER_STATUSES.has(order.status) &&
    order.mercadopago?.payment_id === String(paymentId) &&
    order.mercadopago?.status === payment.status
  ) {
    await updateOrder(order.id, { payment_logs: order.payment_logs });
    if (payment.status === "approved" && !order.confirmation_emails_sent_at) {
      try {
        await maybeSendConfirmationEmails(order);
      } catch (emailErr) {
        console.error("[webhook] reintento correos", order.id, emailErr);
      }
    }
    console.log("[webhook] idempotente, orden ya procesada", order.id);
    return;
  }

  const mpPayload = {
    preference_id: order.mercadopago?.preference_id || null,
    payment_id: String(paymentId),
    status: payment.status,
    status_detail: payment.status_detail || null,
    payment_method_id: payment.payment_method_id || null,
    transaction_amount: paidAmount,
    date_approved: payment.date_approved || null,
    payer_email: payment.payer?.email || order.customer?.email || null,
  };

  const nextStatus = mapPaymentToOrderStatus(payment.status);

  if (payment.status === "approved") {
    if (currency !== "CLP") {
      console.error("[webhook] moneda inválida", currency, order.id);
      await updateOrder(order.id, {
        payment_logs: order.payment_logs,
        mercadopago: mpPayload,
      });
      return;
    }
    if (paidAmount !== expectedTotal) {
      console.error(
        "[webhook] monto no coincide",
        paidAmount,
        expectedTotal,
        order.id
      );
      await updateOrder(order.id, {
        payment_logs: order.payment_logs,
        mercadopago: mpPayload,
      });
      return;
    }
    if (order.plan_id !== "calc") {
      const planCheck = resolveOrderPlan(order);
      if (!planCheck.ok) {
        console.error("[webhook] plan inválido en orden", order.id);
        return;
      }
    }

    order = await updateOrder(order.id, {
      status: "activation_pending",
      mercadopago: mpPayload,
      payment_logs: order.payment_logs,
    });
    console.log("[webhook] orden activation_pending", order.id);

    try {
      await maybeSendConfirmationEmails(order);
    } catch (emailErr) {
      console.error("[webhook] error enviando correos", order.id, emailErr);
    }
    return;
  }

  if (nextStatus) {
    await updateOrder(order.id, {
      status: nextStatus,
      mercadopago: mpPayload,
      payment_logs: order.payment_logs,
    });
    console.log("[webhook] orden", nextStatus, order.id);
    return;
  }

  await updateOrder(order.id, {
    mercadopago: mpPayload,
    payment_logs: order.payment_logs,
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return json(res, 405, { error: "Método no permitido." });
  }

  const subscriptionEvent = extractMercadoPagoSubscriptionWebhookEvent(req);
  if (subscriptionEvent) {
    try {
      const forward = await forwardSubscriptionWebhookToAgent(req);
      if (!forward.ok) {
        console.error(
          "[webhook-forward] agent responded with error",
          subscriptionEvent.topic,
          subscriptionEvent.resourceId,
          forward.status,
          forward.body,
        );
        return json(res, 200, {
          ok: true,
          forwarded: false,
          topic: subscriptionEvent.topic,
          resource_id: subscriptionEvent.resourceId,
          agent_status: forward.status,
          error: "agent_forward_failed",
        });
      }
      console.log(
        "[webhook-forward] subscription forwarded to agent",
        subscriptionEvent.topic,
        subscriptionEvent.resourceId,
        forward.target,
      );
      return json(res, 200, {
        ok: true,
        forwarded: true,
        topic: subscriptionEvent.topic,
        resource_id: subscriptionEvent.resourceId,
        agent: forward.body,
      });
    } catch (err) {
      console.error(
        "[webhook-forward] failed",
        subscriptionEvent.topic,
        subscriptionEvent.resourceId,
        err,
      );
      return json(res, 200, {
        ok: true,
        forwarded: false,
        topic: subscriptionEvent.topic,
        resource_id: subscriptionEvent.resourceId,
        error: "logged",
      });
    }
  }

  const paymentId = extractPaymentId(req);
  if (!paymentId) {
    return json(res, 200, { ok: true, skipped: "no_payment_id" });
  }

  try {
    await processPayment(paymentId, {
      query: req.query,
      body: req.body,
    });
    return json(res, 200, { ok: true });
  } catch (err) {
    console.error("[webhook]", err);
    return json(res, 200, { ok: true, error: "logged" });
  }
}
