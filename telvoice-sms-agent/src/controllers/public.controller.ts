import type { NextFunction, Request, Response } from "express";
import { quoteSmsQuantity } from "../services/commercialQuoteService.js";
import { createPublicLead } from "../services/publicLeadService.js";
import { listActiveSmsProducts } from "../services/smsProductService.js";
import { ValidationError } from "../utils/errors.js";
import { createHash } from "node:crypto";
import { getSupabase } from "../database/supabaseClient.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { confirmOrderCredit } from "../services/smsOrderService.js";
import {
  getBearerTokenFromRequestHeader,
  verifySupabaseAccessToken,
} from "../services/supabaseAuthVerifyService.js";

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
    const bearer = getBearerTokenFromRequestHeader(req.headers.authorization);
    if (!bearer) {
      res.status(401).json({ ok: false, error: "missing_bearer_token" });
      return;
    }
    const verified = await verifySupabaseAccessToken(bearer);

    const body = req.body as Record<string, unknown>;
    const claimToken = String(body.claim_token ?? "").trim();
    const supabaseUserId =
      typeof body.supabase_user_id === "string"
        ? body.supabase_user_id.trim()
        : "";

    if (!claimToken || claimToken.length < 16) {
      throw new ValidationError("claim_token inválido.");
    }
    if (supabaseUserId && supabaseUserId !== verified.userId) {
      res.status(403).json({ ok: false, error: "user_mismatch" });
      return;
    }

    const tokenHash = createHash("sha256").update(claimToken).digest("hex");
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
      .select("id, payment_status, credit_status, claim_status, claim_expires_at, payer_email, checkout_email")
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

    // Validar email del pago vs email autenticado
    const authEmail = verified.email;
    const payer = (order.payer_email ?? "").trim().toLowerCase();
    const checkout = (order.checkout_email ?? "").trim().toLowerCase();
    const emailMatches =
      (payer && payer === authEmail) || (checkout && checkout === authEmail);
    if (!emailMatches) {
      const { error: mrErr } = await getSupabase()
        .from("sms_orders")
        .update({
          claim_status: "manual_review",
          metadata: {
            manual_review_reason: "email_mismatch",
            manual_review_email: authEmail,
            manual_review_at: nowIso,
          } as any,
        })
        .eq("id", order.id)
        .eq("credit_status", "pending_claim");
      if (mrErr) {
        wrapSupabaseError(mrErr, "publicClaim.manual_review");
      }
      res.status(202).json({ ok: false, status: "manual_review" });
      return;
    }

    // Prevención de doble-claim concurrente:
    // solo el primer request que cumpla condiciones actualiza la fila.
    const { data: patched, error: patchErr } = await getSupabase()
      .from("sms_orders")
      .update({
        company_id: companyId,
        credit_status: "pending",
        claim_status: "claimed",
        claimed_at: nowIso,
        claimed_by_user_id: verified.userId,
      })
      .eq("id", order.id)
      .eq("credit_status", "pending_claim")
      .eq("claim_status", "unclaimed")
      .eq("payment_status", "paid")
      .select("id")
      .maybeSingle();
    if (patchErr) {
      wrapSupabaseError(patchErr, "publicClaim.patch");
    }
    if (!patched) {
      // Otro proceso ya lo tomó.
      res.status(409).json({ ok: false, error: "claim_raced" });
      return;
    }

    await confirmOrderCredit(order.id, null, { allowManualWithoutPaid: false });

    // Idempotencia: confirmOrderCredit evita duplicar purchase_credit (reference sms_order).
    res.json({ ok: true, order_id: order.id, status: "claimed" });
  } catch (error) {
    next(error);
  }
}
