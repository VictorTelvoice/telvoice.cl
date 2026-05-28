import type { Request, Response } from "express";
import { buildCheckoutSuccessPageData } from "../services/checkoutSuccessService.js";
import { renderCheckoutSuccessPage } from "../views/checkout-success-page.js";

export async function getCheckoutSuccessPage(
  req: Request,
  res: Response,
): Promise<void> {
  const data = await buildCheckoutSuccessPageData(
    req.query as Record<string, unknown>,
  );

  if (data.confirmingPayment) {
    console.warn("[checkout/success] orden no encontrada tras pago MP", {
      ref: req.query.ref,
      payment_id: req.query.payment_id ?? req.query.collection_id,
      collection_status: req.query.collection_status,
    });
  }

  res
    .status(200)
    .type("html")
    .setHeader("Cache-Control", "private, no-store")
    .send(renderCheckoutSuccessPage(data));
}
