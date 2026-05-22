import type { NextFunction, Request, Response } from "express";
import { quoteSmsQuantity } from "../services/commercialQuoteService.js";
import { createPublicLead } from "../services/publicLeadService.js";
import { listActiveSmsProducts } from "../services/smsProductService.js";
import { ValidationError } from "../utils/errors.js";

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
