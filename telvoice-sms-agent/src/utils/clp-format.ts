export function formatClp(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

export const IVA_RATE = 0.19;

export const HIGH_VOLUME_SMS_THRESHOLD = 120_000;

export const HIGH_VOLUME_UNIT_PRICE_CLP = 5;

export function calcIvaFromSubtotal(subtotal: number): {
  subtotal: number;
  iva: number;
  total_with_iva: number;
} {
  const iva = Math.round(subtotal * IVA_RATE);
  return {
    subtotal,
    iva,
    total_with_iva: subtotal + iva,
  };
}
