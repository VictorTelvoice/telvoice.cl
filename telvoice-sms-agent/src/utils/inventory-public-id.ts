import { createHmac } from "node:crypto";
import { env } from "../config/env.js";

const PREFIX = "pub_";

function hmacSecret(): string {
  return (
    env.numeracionesInbound.webhookSecret?.trim() ||
    env.mercadopago.accessToken?.trim()?.slice(0, 16) ||
    "telvoice-inventory-public-id-dev"
  );
}

/** Identificador público opaco para seleccionar inventario sin exponer UUID. */
export function inventoryPublicId(inventoryId: string): string {
  const digest = createHmac("sha256", hmacSecret())
    .update(inventoryId)
    .digest("base64url")
    .slice(0, 12);
  return `${PREFIX}${digest}`;
}

export function isInventoryPublicId(value: string): boolean {
  return typeof value === "string" && value.startsWith(PREFIX) && value.length > PREFIX.length;
}

/** Resuelve public id contra una lista acotada de filas de inventario. */
export function resolveInventoryIdFromPublicId(
  publicId: string,
  inventoryIds: string[],
): string | null {
  if (!isInventoryPublicId(publicId)) return null;
  for (const id of inventoryIds) {
    if (inventoryPublicId(id) === publicId) return id;
  }
  return null;
}
