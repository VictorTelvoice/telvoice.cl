/** Metadata comercial en sms_packages.metadata (jsonb). */
export type PackageMetadata = {
  customer_visible?: boolean;
  channel?: string;
  segment?: string;
  qa?: boolean;
  internal?: boolean;
  test?: boolean;
};

export const PACKAGE_CHANNELS = ["web", "internal", "partner"] as const;
export const PACKAGE_SEGMENTS = [
  "standard",
  "enterprise",
  "promo",
  "qa",
  "test",
] as const;

const QA_NAME_MARKERS = [
  "qa",
  "e2e",
  "prueba",
  "unmapped",
  " test",
  "test ",
  "fixture",
  "sandbox",
] as const;

export function isQaPackageName(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) {
    return false;
  }
  return QA_NAME_MARKERS.some((marker) => n.includes(marker));
}

/** Producto/paquete excluido del catálogo público (/api/public/products, landing). */
export function isExcludedFromPublicCatalog(
  name: string,
  metadata: Record<string, unknown> = {},
): boolean {
  const m = parsePackageMetadata(metadata);
  if (m.customer_visible === false) {
    return true;
  }
  if (m.qa === true || m.internal === true || m.test === true) {
    return true;
  }

  const segment = String(m.segment ?? "")
    .trim()
    .toLowerCase();
  if (segment === "qa" || segment === "test") {
    return true;
  }

  const channel = String(m.channel ?? "")
    .trim()
    .toLowerCase();
  if (channel === "internal") {
    return true;
  }

  if (isQaPackageName(name)) {
    return true;
  }

  const raw = metadata as Record<string, unknown>;
  if (raw.qa === true || raw.internal === true || raw.test === true) {
    return true;
  }

  return false;
}

/** Elegible para catálogo web público (bolsas comerciales reales). */
export function isPublicCatalogEligible(
  name: string,
  metadata: Record<string, unknown> = {},
): boolean {
  return !isExcludedFromPublicCatalog(name, metadata);
}

export function defaultCommercialMetadata(name?: string): PackageMetadata {
  const qa = name ? isQaPackageName(name) : false;
  return {
    customer_visible: !qa,
    channel: qa ? "internal" : "web",
    segment: "standard",
  };
}

export function parsePackageMetadata(raw: unknown): PackageMetadata {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const m = raw as Record<string, unknown>;
  return {
    customer_visible:
      typeof m.customer_visible === "boolean" ? m.customer_visible : undefined,
    channel: typeof m.channel === "string" ? m.channel : undefined,
    segment: typeof m.segment === "string" ? m.segment : undefined,
    qa: m.qa === true ? true : undefined,
    internal: m.internal === true ? true : undefined,
    test: m.test === true ? true : undefined,
  };
}

export function mergePackageMetadata(
  existing: Record<string, unknown>,
  patch: PackageMetadata,
): Record<string, unknown> {
  const base = { ...existing };
  if (patch.customer_visible !== undefined) {
    base.customer_visible = patch.customer_visible;
  }
  if (patch.channel !== undefined) {
    base.channel = patch.channel;
  }
  if (patch.segment !== undefined) {
    base.segment = patch.segment;
  }
  return base;
}

export function isCustomerVisible(metadata: Record<string, unknown>): boolean {
  const m = parsePackageMetadata(metadata);
  return m.customer_visible !== false;
}

/** sms_products: sin metadata; se evalúa por nombre y product_type. */
export function isPublicCatalogProductEligible(input: {
  product_name: string;
  product_type?: string;
  is_active?: boolean;
}): boolean {
  if (input.is_active === false) {
    return false;
  }
  const type = String(input.product_type ?? "sms_bundle")
    .trim()
    .toLowerCase();
  if (type === "internal" || type === "qa" || type === "test") {
    return false;
  }
  return isPublicCatalogEligible(input.product_name, {});
}
