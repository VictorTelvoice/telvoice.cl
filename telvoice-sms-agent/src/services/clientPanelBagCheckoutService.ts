import { quoteSmsQuantity } from "./commercialQuoteService.js";
import {
  createSmsPackage,
  findActiveSmsPackageByQuantityAndTotal,
} from "./smsPackageService.js";
import { AppError } from "../utils/errors.js";
import { ValidationError } from "../utils/errors.js";
import {
  isMiniSmsBagQuantity,
  MINI_SMS_BAG_LABEL,
  MINI_SMS_BAG_QUANTITY,
  MINI_SMS_BAG_TOTAL_CLP,
  MINI_SMS_BAG_UNIT_PRICE_NET,
  PUBLIC_SMS_QUANTITY_ERROR,
} from "../utils/publicSmsCheckoutQuantity.js";
import { SMS_BAG_CALC_MAX_VOLUME } from "../utils/smsBagCalculator.js";

export async function resolveSmsPackageForCalculatorQuantity(
  quantity: number,
  countryCode = "CL",
): Promise<{ packageId: string; quotedQuantity: number; totalWithIva: number }> {
  if (!Number.isFinite(quantity) || quantity < 1) {
    throw new ValidationError("Cantidad de SMS inválida.");
  }

  const rounded = Math.round(quantity);
  if (!isMiniSmsBagQuantity(rounded) && rounded < 1000) {
    throw new ValidationError(PUBLIC_SMS_QUANTITY_ERROR);
  }

  if (isMiniSmsBagQuantity(rounded)) {
    let pkg = await findActiveSmsPackageByQuantityAndTotal({
      smsQuantity: MINI_SMS_BAG_QUANTITY,
      totalPrice: MINI_SMS_BAG_TOTAL_CLP,
      currency: "CLP",
    });

    if (!pkg) {
      pkg = await createSmsPackage({
        name: MINI_SMS_BAG_LABEL,
        country: countryCode,
        smsQuantity: MINI_SMS_BAG_QUANTITY,
        totalPrice: MINI_SMS_BAG_TOTAL_CLP,
        unitPrice: MINI_SMS_BAG_UNIT_PRICE_NET,
        currency: "CLP",
        metadata: {
          customer_visible: true,
          channel: "web",
          segment: "mini_bag",
        },
      });
    }

    if (!pkg.is_active) {
      throw new AppError("La bolsa mini no está disponible para compra.", 404);
    }

    return {
      packageId: pkg.id,
      quotedQuantity: MINI_SMS_BAG_QUANTITY,
      totalWithIva: MINI_SMS_BAG_TOTAL_CLP,
    };
  }

  const quote = await quoteSmsQuantity(rounded, countryCode);
  if (quote.quoted_quantity > SMS_BAG_CALC_MAX_VOLUME) {
    throw new ValidationError(
      `Para más de ${SMS_BAG_CALC_MAX_VOLUME.toLocaleString("es-CL")} SMS contacta a soporte comercial.`,
    );
  }

  let pkg = await findActiveSmsPackageByQuantityAndTotal({
    smsQuantity: quote.quoted_quantity,
    totalPrice: quote.total_with_iva,
    currency: quote.currency,
  });

  if (!pkg) {
    pkg = await createSmsPackage({
      name: `Bolsa ${quote.quoted_quantity.toLocaleString("es-CL")} SMS`,
      country: countryCode,
      smsQuantity: quote.quoted_quantity,
      totalPrice: quote.total_with_iva,
      unitPrice: quote.unit_price,
      currency: quote.currency,
      metadata: {
        customer_visible: true,
        channel: "web",
        segment: "standard",
      },
    });
  }

  if (!pkg.is_active) {
    throw new AppError("La bolsa calculada no está disponible para compra.", 404);
  }

  return {
    packageId: pkg.id,
    quotedQuantity: quote.quoted_quantity,
    totalWithIva: quote.total_with_iva,
  };
}
