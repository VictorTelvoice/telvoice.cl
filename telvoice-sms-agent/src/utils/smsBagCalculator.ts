import { IVA_RATE } from "./clp-format.js";

export const SMS_BAG_CALC_MAX_VOLUME = 120_000;

/** Ancho máximo del bloque calculadora en panel (≈ contenido útil del landing en 920px). */
export const SMS_BAG_CALC_PANEL_MAX_WIDTH_PX = 840;

export type VolumeTierRange = {
  min: number;
  max: number;
  pxSMS: number;
  label: string;
};

export type SmsBagCalcQuote = {
  volume: number;
  unitPrice: number;
  tierLabel: string;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
};

export function buildVolumeTierRanges(
  tiers: { min_quantity: number; unit_price: number; label: string }[],
  maxVolume = SMS_BAG_CALC_MAX_VOLUME,
): VolumeTierRange[] {
  const sorted = [...tiers].sort((a, b) => a.min_quantity - b.min_quantity);
  return sorted.map((tier, index) => {
    const next = sorted[index + 1];
    const max = next ? next.min_quantity - 1 : maxVolume;
    return {
      min: tier.min_quantity,
      max,
      pxSMS: Number(tier.unit_price),
      label: tier.label,
    };
  });
}

export function buildCalcVolumes(maxVolume = SMS_BAG_CALC_MAX_VOLUME): number[] {
  const list: number[] = [];
  for (let v = 1000; v <= 90_000; v += 1000) {
    list.push(v);
  }
  for (let v = 100_000; v <= maxVolume; v += 1000) {
    list.push(v);
  }
  return list;
}

export function snapCalcVolume(
  volume: number,
  maxVolume = SMS_BAG_CALC_MAX_VOLUME,
): number {
  let v = Math.round(volume);
  if (v < 1000) return 1000;
  v = Math.round(v / 1000) * 1000;
  if (v < 1000) return 1000;
  if (v > maxVolume) return maxVolume;
  if (v > 90_000 && v < 100_000) return 100_000;
  return v;
}

export function findCalcTier(
  volume: number,
  tiers: VolumeTierRange[],
  maxVolume = SMS_BAG_CALC_MAX_VOLUME,
): VolumeTierRange | null {
  const v = snapCalcVolume(volume, maxVolume);
  return tiers.find((tier) => v >= tier.min && v <= tier.max) ?? null;
}

export function quoteFromCalcVolume(
  volume: number,
  tiers: VolumeTierRange[],
  maxVolume = SMS_BAG_CALC_MAX_VOLUME,
  ivaRate = IVA_RATE,
): SmsBagCalcQuote | null {
  const v = snapCalcVolume(volume, maxVolume);
  const tier = findCalcTier(v, tiers, maxVolume);
  if (!tier) return null;
  const netAmount = v * tier.pxSMS;
  const taxAmount = Math.round(netAmount * ivaRate);
  return {
    volume: v,
    unitPrice: tier.pxSMS,
    tierLabel: tier.label,
    netAmount,
    taxAmount,
    totalAmount: netAmount + taxAmount,
  };
}

export function calcTierSuggestionVolumes(
  tiers: VolumeTierRange[],
): { vol: number; pxSMS: number }[] {
  const out: { vol: number; pxSMS: number }[] = [];
  tiers.forEach((tier, index) => {
    if (index === 0 || tier.pxSMS !== tiers[index - 1]!.pxSMS) {
      out.push({ vol: tier.min, pxSMS: tier.pxSMS });
    }
  });
  return out;
}
