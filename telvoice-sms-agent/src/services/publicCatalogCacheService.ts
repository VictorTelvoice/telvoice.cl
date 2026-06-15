import { createMemoryTtlCache } from "../utils/memoryTtlCache.js";
import { listCustomerVisiblePackages } from "./smsPackageService.js";
import { listActiveSmsProducts } from "./smsProductService.js";
import { getPublicAvailability } from "./realNumberInventoryService.js";
import type { SmsProductRow } from "../types/commercial.js";
import type { PublicRealNumberAvailability } from "../types/real-number-inventory.js";
import type { SmsPackageRow } from "../types/wallet.js";

const PUBLIC_CATALOG_CACHE_TTL_MS = 45_000;

const productsCache = createMemoryTtlCache<{
  products: SmsProductRow[];
  packages: SmsPackageRow[];
}>(PUBLIC_CATALOG_CACHE_TTL_MS);

const simAvailabilityCache = createMemoryTtlCache<PublicRealNumberAvailability>(
  PUBLIC_CATALOG_CACHE_TTL_MS,
);

export async function getCachedActiveSmsProducts(
  countryCode = "CL",
): Promise<SmsProductRow[]> {
  const key = `products:${countryCode.toUpperCase()}`;
  const hit = productsCache.get(key);
  if (hit) {
    return hit.products;
  }
  const products = await listActiveSmsProducts(countryCode);
  const packages = await listCustomerVisiblePackages(countryCode);
  productsCache.set(key, { products, packages });
  return products;
}

export async function getCachedCustomerVisiblePackages(
  countryCode = "CL",
): Promise<SmsPackageRow[]> {
  const key = `products:${countryCode.toUpperCase()}`;
  const hit = productsCache.get(key);
  if (hit) {
    return hit.packages;
  }
  const products = await listActiveSmsProducts(countryCode);
  const packages = await listCustomerVisiblePackages(countryCode);
  productsCache.set(key, { products, packages });
  return packages;
}

export async function getCachedPublicSimAvailability(): Promise<PublicRealNumberAvailability> {
  const key = "sim-availability";
  const hit = simAvailabilityCache.get(key);
  if (hit) {
    return hit;
  }
  const availability = await getPublicAvailability();
  simAvailabilityCache.set(key, availability);
  return availability;
}
