import { getOrder } from "../../lib/orders.js";
import { toPublicOrderSummary } from "../../lib/order-summary.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "private, no-store");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, error: "Método no permitido." });
  }

  const orderId = String(req.query?.order_id || req.query?.id || "").trim();
  if (!orderId || !UUID_RE.test(orderId)) {
    return json(res, 400, { ok: false, error: "Orden inválida." });
  }

  try {
    const order = await getOrder(orderId);
    if (!order) {
      return json(res, 404, { ok: false, error: "Orden no encontrada." });
    }
    return json(res, 200, {
      ok: true,
      order: toPublicOrderSummary(order),
    });
  } catch (err) {
    console.error("[orders/summary]", err);
    return json(res, 500, { ok: false, error: "No pudimos cargar el resumen." });
  }
}
