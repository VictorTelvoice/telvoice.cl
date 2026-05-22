import { isSupabaseConfigured } from "../../lib/web-agent/supabase-rest.js";
import { getPublicPricingTiers } from "../../lib/web-agent/telvoiceQuoteService.js";
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
    let tiers = getPublicPricingTiers();

    if (isSupabaseConfigured()) {
      try {
        const res = await fetch(
          `${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/sms_pricing_tiers?country_code=eq.CL&is_active=eq.true&order=min_quantity.asc&select=min_quantity,unit_price,currency,label`,
          {
            headers: {
              apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            },
          },
        );
        const data = await res.json();
        if (res.ok && Array.isArray(data) && data.length > 0) {
          tiers = data.map((t) => ({
            min_quantity: t.min_quantity,
            unit_price: Number(t.unit_price),
            label: t.label,
            currency: t.currency || "CLP",
          }));
        }
      } catch (e) {
        console.warn("[web-agent/pricing] fallback tiers", e.message);
      }
    }

    return json(req, res, 200, { ok: true, tiers });
  } catch (err) {
    return json(req, res, 500, { ok: false, error: err.message });
  }
}
