import { validateUuidParam } from "./validation.js";
import { ValidationError } from "./errors.js";
import { resolveSmsPackageForCalculatorQuantity } from "../services/clientPanelBagCheckoutService.js";

/** package_id (legacy) o sms_quantity (calculadora). */
export function parseBuySmsPackageIdFromBody(body: Record<string, unknown>): {
  mode: "package_id";
  packageId: string;
} {
  const packageId = String(body.package_id ?? "").trim();
  if (!packageId) {
    throw new ValidationError("Debes indicar una bolsa para comprar.");
  }
  return {
    mode: "package_id",
    packageId: validateUuidParam(packageId, "package_id"),
  };
}

export function parseBuySmsQuantityFromBody(body: Record<string, unknown>): number {
  const raw = body.sms_quantity ?? body.quantity;
  const quantity = Number(raw);
  if (!Number.isFinite(quantity) || quantity < 1) {
    throw new ValidationError("Cantidad de SMS inválida.");
  }
  return Math.round(quantity);
}

export function buySmsBodyUsesCalculator(body: Record<string, unknown>): boolean {
  const qtyRaw = body.sms_quantity ?? body.quantity;
  if (qtyRaw === undefined || qtyRaw === null || String(qtyRaw).trim() === "") {
    return false;
  }
  return true;
}

export async function resolveBuySmsPackageId(
  body: Record<string, unknown>,
  countryCode: string,
): Promise<string> {
  if (buySmsBodyUsesCalculator(body)) {
    const quantity = parseBuySmsQuantityFromBody(body);
    const resolved = await resolveSmsPackageForCalculatorQuantity(
      quantity,
      countryCode,
    );
    return resolved.packageId;
  }
  return parseBuySmsPackageIdFromBody(body).packageId;
}
