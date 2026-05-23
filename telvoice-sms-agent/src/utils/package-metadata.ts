/** Metadata comercial en sms_packages.metadata (jsonb). */
export type PackageMetadata = {
  customer_visible?: boolean;
  channel?: string;
  segment?: string;
};

export const PACKAGE_CHANNELS = ["web", "internal", "partner"] as const;
export const PACKAGE_SEGMENTS = ["standard", "enterprise", "promo"] as const;

export function isQaPackageName(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("qa") || n.includes("e2e") || n.includes("prueba");
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
