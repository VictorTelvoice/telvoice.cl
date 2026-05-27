import type { NextFunction, Request, Response } from "express";
import { quoteSmsQuantity } from "../services/commercialQuoteService.js";
import { createPublicLead } from "../services/publicLeadService.js";
import { listActiveSmsProducts } from "../services/smsProductService.js";
import { ValidationError } from "../utils/errors.js";
import { createHash } from "node:crypto";
import { getSupabase } from "../database/supabaseClient.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { confirmOrderCredit } from "../services/smsOrderService.js";

export async function getPublicProducts(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const countryCode =
      typeof _req.query.country_code === "string"
        ? _req.query.country_code.toUpperCase()
        : "CL";

    const products = await listActiveSmsProducts(countryCode);

    res.json({
      success: true,
      country_code: countryCode,
      products: products.map((p) => ({
        id: p.id,
        product_name: p.product_name,
        description: p.description,
        sms_quantity: p.sms_quantity,
        currency: p.currency,
        price_amount: p.price_amount,
        unit_price: Number(p.unit_price),
        checkout_url: p.checkout_url,
        is_featured: p.is_featured,
        product_type: p.product_type,
      })),
    });
  } catch (error) {
    next(error);
  }
}

export async function postPublicQuote(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const countryCode = String(body.country_code ?? "CL")
      .trim()
      .toUpperCase();
    const quantity = Number(body.quantity);

    if (!Number.isFinite(quantity) || quantity < 1) {
      throw new ValidationError("quantity debe ser un número entero positivo.");
    }

    const quote = await quoteSmsQuantity(quantity, countryCode);

    res.json({
      success: true,
      country_code: quote.country_code,
      requested_quantity: quote.requested_quantity,
      quoted_quantity: quote.quoted_quantity,
      quantity: quote.quoted_quantity,
      was_rounded: quote.was_rounded,
      tier_label: quote.tier_label,
      quote_type: quote.quote_type,
      recommended_product: quote.product
        ? {
            id: quote.product.id,
            product_name: quote.product.product_name,
            sms_quantity: quote.product.sms_quantity,
          }
        : null,
      unit_price: quote.unit_price,
      subtotal: quote.subtotal,
      iva: quote.iva,
      total_with_iva: quote.total_with_iva,
      currency: quote.currency,
      checkout_url: quote.checkout_url,
      commercial_message: quote.commercial_message,
      includes: quote.includes,
    });
  } catch (error) {
    next(error);
  }
}

export async function postPublicLead(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const email =
      typeof body.email === "string" ? body.email.trim() : undefined;
    const phone =
      typeof body.phone === "string" ? body.phone.trim() : undefined;

    const lead = await createPublicLead({
      name: typeof body.name === "string" ? body.name : undefined,
      email,
      phone,
      company: typeof body.company === "string" ? body.company : undefined,
      country: typeof body.country === "string" ? body.country : "CL",
      message: typeof body.message === "string" ? body.message : undefined,
      requested_quantity:
        body.requested_quantity !== undefined
          ? Number(body.requested_quantity)
          : undefined,
      source:
        body.source === "landing_agent" ? "landing_agent" : "telegram_agent",
    });

    res.status(201).json({
      success: true,
      lead_id: lead.id,
      status: lead.status,
      message:
        "Solicitud registrada. Telvoice te contactará o enviará el link de pago.",
    });
  } catch (error) {
    next(error);
  }
}

export async function postPublicClaim(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const token = String(body.claim_token ?? "").trim();
    const supabaseUserId = String(body.supabase_user_id ?? "").trim();

    if (!token || token.length < 16) {
      throw new ValidationError("claim_token inválido.");
    }
    if (!supabaseUserId || supabaseUserId.length < 10) {
      throw new ValidationError("supabase_user_id inválido.");
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const nowIso = new Date().toISOString();

    // Resolver company_id desde user_profiles (login ya creó el perfil).
    const { data: profile, error: profErr } = await getSupabase()
      .from("user_profiles")
      .select("company_id")
      .eq("user_id", supabaseUserId)
      .maybeSingle();
    if (profErr) {
      wrapSupabaseError(profErr, "publicClaim.profile");
    }
    const companyId = profile?.company_id ?? null;
    if (!companyId) {
      throw new ValidationError("No hay empresa asociada para activar la compra.");
    }

    // Buscar orden pendiente de claim
    const { data: order, error: orderErr } = await getSupabase()
      .from("sms_orders")
      .select("id, payment_status, credit_status, claim_status, claim_expires_at")
      .eq("claim_token_hash", tokenHash)
      .maybeSingle();
    if (orderErr) {
      wrapSupabaseError(orderErr, "publicClaim.order");
    }
    if (!order) {
      res.status(404).json({ ok: false, error: "claim_not_found" });
      return;
    }
    if (order.claim_expires_at && order.claim_expires_at < nowIso) {
      res.status(410).json({ ok: false, error: "claim_expired" });
      return;
    }
    if (order.claim_status && order.claim_status !== "unclaimed") {
      res.status(409).json({ ok: false, error: "claim_already_used" });
      return;
    }
    if (order.credit_status !== "pending_claim") {
      res.status(409).json({ ok: false, error: "order_not_pending_claim" });
      return;
    }
    if (order.payment_status !== "paid") {
      res.status(409).json({ ok: false, error: "order_not_paid" });
      return;
    }

    // Adjuntar orden a empresa y pasar a pending para acreditar.
    const { error: patchErr } = await getSupabase()
      .from("sms_orders")
      .update({
        company_id: companyId,
        credit_status: "pending",
        claim_status: "claimed",
        claimed_at: nowIso,
        claimed_by_user_id: supabaseUserId,
      })
      .eq("id", order.id)
      .eq("credit_status", "pending_claim");
    if (patchErr) {
      wrapSupabaseError(patchErr, "publicClaim.patch");
    }

    await confirmOrderCredit(order.id, null, { allowManualWithoutPaid: false });

    res.json({ ok: true, order_id: order.id });
  } catch (error) {
    next(error);
  }
}
