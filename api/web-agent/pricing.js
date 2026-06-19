import { fetchMinQuantityTiers, getPublicPricingTiers } from "../../lib/telvoice-pricing-tiers.js";
import { applyCors, json } from "./_shared.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    applyCors(req, res);
    return res.status(204).end();
  }
  if (req.method !== "GET") {
    return json(req, res, 405, { ok: false, error: "Método no permitido." });
  }

  try {
    const tiers = await fetchMinQuantityTiers();
    return json(req, res, 200, {
      ok: true,
      success: true,
      tiers: getPublicPricingTiers(tiers).map((t) => ({
        min_quantity: t.min_quantity,
        min_sms: t.min_quantity,
        unit_price: t.unit_price,
        unit_price_clp: t.unit_price,
        label: t.label,
        currency: t.currency,
      })),
    });
  } catch (err) {
    return json(req, res, 500, { ok: false, error: err.message });
  }
}
