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

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return json(res, 405, { error: "Método no permitido." });
  }

  try {
    const body = req.body || {};
    const planId = body.plan_id;
    const plan = getPlan(planId);

    if (!plan) {
      return json(res, 400, {
        error: "Plan no válido. Solo están disponibles los planes publicados.",
      });
    }

    const customerCheck = validateCustomer(body.customer);
    if (!customerCheck.ok) {
      return json(res, 400, { error: customerCheck.errors.join(" ") });
    }

    const orderId = randomUUID();
    let order = createOrderRecord({
      id: orderId,
      plan,
      customer: customerCheck.customer,
    });

    await saveOrder(order);

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

    const redirectUrl = checkoutRedirectUrl(preference);
    if (!redirectUrl) {
      return json(res, 500, {
        error: "Mercado Pago no devolvió URL de pago. Intente más tarde.",
      });
    }

    return json(res, 200, {
      order_id: orderId,
      init_point: redirectUrl,
      preference_id: preference.id,
    });
  } catch (err) {
    console.error("[create-preference]", err);
    return json(res, 500, {
      error:
        err.message ||
        "No pudimos iniciar el pago. Intente nuevamente o contáctenos.",
    });
  }
}
