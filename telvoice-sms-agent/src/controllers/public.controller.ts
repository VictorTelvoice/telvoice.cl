import type { NextFunction, Request, Response } from "express";
import { quoteSmsQuantity } from "../services/commercialQuoteService.js";
import { createPublicLead } from "../services/publicLeadService.js";
import { listActiveSmsProducts } from "../services/smsProductService.js";
import { ValidationError } from "../utils/errors.js";
import { createHash } from "node:crypto";
import { getSupabase } from "../database/supabaseClient.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { confirmOrderCredit, getOrderById } from "../services/smsOrderService.js";
import {
  startPublicLandingCheckout,
  startPublicSimCheckout,
} from "../services/publicCheckoutService.js";
import { runBillingSyncBestEffort } from "../services/billingSyncService.js";
import { sendPostClaimEmailsBestEffort } from "../services/transactionalEmailService.js";
import { listCustomerVisiblePackages } from "../services/smsPackageService.js";
import { isSimSubscriptionOrder } from "../utils/order-display.js";
import { isSimPlanId } from "../utils/simPlans.js";
import { linkSimActivationToCompany } from "../services/simActivationService.js";
import {
  getBearerTokenFromRequestHeader,
  verifySupabaseAccessToken,
} from "../services/supabaseAuthVerifyService.js";
import { validateUuidParam } from "../utils/validation.js";

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

    // Preferimos sms_products si existe; si está vacío (por compatibilidad),
    // devolvemos un catálogo mínimo desde sms_packages visibles para web.
    if (!products.length) {
      const packages = await listCustomerVisiblePackages(countryCode);
      res.json({
        success: true,
        country_code: countryCode,
        products: packages.map((p) => ({
          id: p.id,
          package_id: p.id,
          product_name: p.name,
          description: null,
          sms_quantity: p.sms_quantity,
          currency: p.currency,
          price_amount: Math.round(Number(p.total_price)),
          unit_price: Number(p.unit_price ?? 0),
          checkout_url: null,
          is_featured: false,
          product_type: "sms_bundle",
        })),
      });
      return;
    }

    const visiblePackages = await listCustomerVisiblePackages(countryCode);
    const packageByKey = new Map<string, string>();
    for (const p of visiblePackages) {
      const k = `${p.sms_quantity}|${Math.round(Number(p.total_price))}|${String(p.currency ?? "CLP").toUpperCase()}`;
      if (!packageByKey.has(k)) {
        packageByKey.set(k, p.id);
      }
    }

    const publicProducts = products.filter((p) =>
      visiblePackages.some(
        (pkg) =>
          pkg.sms_quantity === p.sms_quantity &&
          Math.round(Number(pkg.total_price)) === Math.round(Number(p.price_amount)) &&
          String(pkg.currency ?? "CLP").toUpperCase() ===
            String(p.currency ?? "CLP").toUpperCase(),
      ),
    );

    res.json({
      success: true,
      country_code: countryCode,
      products: publicProducts.map((p) => ({
        id: p.id,
        package_id:
          packageByKey.get(
            `${p.sms_quantity}|${Math.round(Number(p.price_amount))}|${String(p.currency ?? "CLP").toUpperCase()}`,
          ) ?? null,
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

export async function postPublicCheckout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const checkoutEmail = String(body.checkout_email ?? body.email ?? "").trim();
    const payerEmail =
      typeof body.payer_email === "string" ? body.payer_email.trim() : undefined;
    const payerName =
      typeof body.payer_name === "string" ? body.payer_name.trim() : undefined;
    const productType = String(body.product_type ?? "").trim().toLowerCase();
    const planIdRaw = String(body.plan_id ?? body.planId ?? "").trim().toLowerCase();

    if (!checkoutEmail.includes("@")) {
      throw new ValidationError("checkout_email inválido.");
    }

    const isSimCheckout =
      productType === "sim_subscription" || isSimPlanId(planIdRaw);

    if (isSimCheckout) {
      if (!isSimPlanId(planIdRaw)) {
        throw new ValidationError("plan_id SIM no válido.");
      }

      const result = await startPublicSimCheckout({
        planId: planIdRaw,
        checkoutEmail,
        payerEmail,
        payerName,
        companyName:
          typeof body.company_name === "string"
            ? body.company_name.trim()
            : undefined,
        phone: typeof body.phone === "string" ? body.phone.trim() : undefined,
        taxId:
          typeof body.tax_id === "string"
            ? body.tax_id.trim()
            : typeof body.rut === "string"
              ? body.rut.trim()
              : undefined,
      });

      res.status(201).json({
        success: true,
        product_type: "sim_subscription",
        order_id: result.orderId,
        claim_token: result.claimToken,
        checkout_url: result.checkoutUrl,
        public_checkout_reference: result.publicCheckoutReference,
        preference_id: result.preferenceId,
      });
      return;
    }

    const packageIdRaw = String(body.package_id ?? "").trim();
    const packageId = validateUuidParam(packageIdRaw, "package_id");

    const result = await startPublicLandingCheckout({
      packageId,
      checkoutEmail,
      payerEmail,
      payerName,
    });

    res.status(201).json({
      success: true,
      product_type: "sms_bundle",
      order_id: result.orderId,
      claim_token: result.claimToken,
      checkout_url: result.checkoutUrl,
      public_checkout_reference: result.publicCheckoutReference,
      preference_id: result.preferenceId,
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
    const bodySupabaseUserId =
      typeof body.supabase_user_id === "string"
        ? body.supabase_user_id.trim()
        : "";

    if (!claimToken || claimToken.length < 16) {
      throw new ValidationError("claim_token inválido.");
    }
    if (bodySupabaseUserId && bodySupabaseUserId !== verified.userId) {
      res.status(403).json({ ok: false, error: "user_mismatch" });
      return;
    }

    const tokenHash = createHash("sha256").update(claimToken).digest("hex");
    const nowIso = new Date().toISOString();

    // Resolver company_id desde user_profiles (login ya creó el perfil).
    const { data: profile, error: profErr } = await getSupabase()
      .from("user_profiles")
      .select("company_id")
      .eq("user_id", verified.userId)
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

    const fullOrder = await getOrderById(order.id);
    if (fullOrder && isSimSubscriptionOrder(fullOrder)) {
      await linkSimActivationToCompany(order.id, companyId);

      res.json({
        ok: true,
        order_id: order.id,
        status: "claimed_sim_pending_activation",
        message:
          "Pago recibido. Tu solicitud de numeración SIM real está en revisión y activación.",
      });
      return;
    }

    await confirmOrderCredit(order.id, null, {
      allowManualWithoutPaid: false,
      ratePlanSource: "public_checkout_claim",
    });

    try {
      await runBillingSyncBestEffort(order.id, { source: "public_claim" });
    } catch (billingErr) {
      console.error("[publicClaim] billing sync failed", order.id, billingErr);
    }

    void sendPostClaimEmailsBestEffort(order.id);

    res.json({ ok: true, order_id: order.id, status: "claimed" });
  } catch (error) {
    next(error);
  }
}
