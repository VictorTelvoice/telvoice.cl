import { randomUUID } from "crypto";
import { getPlan, planItemTitle } from "../../lib/plans.js";
import {
  createOrderRecord,
  saveOrder,
  updateOrder,
} from "../../lib/orders.js";
import { validateCustomer } from "../../lib/validate.js";
import {
  createCheckoutPreference,
  checkoutRedirectUrl,
} from "../../lib/mercadopago.js";

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function parseRequestBody(req) {
  const raw = req.body;
  if (raw && typeof raw === "object" && !Buffer.isBuffer(raw)) {
    return raw;
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

function logEnvDiagnostics(planId, plan) {
  console.info("[create-preference] env", {
    plan_id: planId,
    total_amount: plan?.total_amount ?? null,
    currency: plan?.currency ?? "CLP",
    has_access_token: Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN),
    has_blob_token: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    has_public_site_url: Boolean(process.env.PUBLIC_SITE_URL),
    sandbox: process.env.MERCADOPAGO_SANDBOX === "true",
  });
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Método no permitido." });
  }

  let planId = null;

  try {
    const body = parseRequestBody(req);
    planId = body.plan_id || body.planId || null;
    const plan = getPlan(planId);

    logEnvDiagnostics(planId, plan);

    if (!plan) {
      console.warn("[create-preference] plan_id inválido", { plan_id: planId });
      return json(res, 400, {
        ok: false,
        error: "Plan no válido. Solo están disponibles los planes publicados.",
      });
    }

    const customerCheck = validateCustomer(body.customer);
    if (!customerCheck.ok) {
      return json(res, 400, { ok: false, error: customerCheck.errors.join(" ") });
    }

    const orderId = randomUUID();
    let order = createOrderRecord({
      id: orderId,
      plan,
      customer: customerCheck.customer,
    });

    await saveOrder(order);
    console.info("[create-preference] orden guardada", {
      order_id: orderId,
      status: order.status,
      blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    });

    const preference = await createCheckoutPreference({
      order,
      plan,
      itemTitle: planItemTitle(plan),
    });

    order = await updateOrder(orderId, {
      mercadopago: {
        ...order.mercadopago,
        preference_id: preference.id || null,
      },
    });

    const checkoutUrl = checkoutRedirectUrl(preference);
    if (!checkoutUrl) {
      console.error("[create-preference] sin URL de checkout", {
        order_id: orderId,
        preference_id: preference.id,
        has_init_point: Boolean(preference.init_point),
        has_sandbox_init_point: Boolean(preference.sandbox_init_point),
      });
      return json(res, 500, {
        ok: false,
        error: "Mercado Pago no devolvió URL de pago. Intente más tarde.",
      });
    }

    console.info("[create-preference] ok", {
      order_id: orderId,
      preference_id: preference.id,
      checkout_host: checkoutUrl.split("/")[2] || "unknown",
    });

    return json(res, 200, {
      ok: true,
      order_id: orderId,
      checkout_url: checkoutUrl,
      init_point: preference.init_point || checkoutUrl,
      sandbox_init_point: preference.sandbox_init_point || null,
      preference_id: preference.id,
    });
  } catch (err) {
    console.error("[create-preference] error", {
      plan_id: planId,
      message: err.message,
      stack: err.stack,
    });
    const clientMessage =
      err.message && /blob|token|configurado/i.test(err.message)
        ? "No pudimos iniciar el pago. Intenta nuevamente o contáctanos por WhatsApp."
        : err.message ||
          "No pudimos iniciar el pago. Intenta nuevamente o contáctanos por WhatsApp.";
    return json(res, 500, {
      ok: false,
      error: clientMessage,
    });
  }
}
