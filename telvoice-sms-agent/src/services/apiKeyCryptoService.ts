import crypto from "node:crypto";
import { env } from "../config/env.js";
import type { ClientApiKeyEnvironment } from "../types/client-api-keys.js";
import { AppError } from "../utils/errors.js";

export const API_KEY_PREFIX_LENGTH = 20;
export const API_KEY_TOKEN_LENGTH = 32;

const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function isApiKeyPepperConfigured(): boolean {
  return env.apiKeys.pepper.length > 0;
}

export function assertApiKeyPepperConfigured(): void {
  if (!isApiKeyPepperConfigured()) {
    throw new AppError(
      "No se pueden crear API Keys: falta configurar API_KEY_PEPPER en el servidor.",
      503,
      "API_KEY_PEPPER_MISSING",
    );
  }
}

function getPepper(): string {
  assertApiKeyPepperConfigured();
  return env.apiKeys.pepper;
}

function randomToken(length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TOKEN_ALPHABET[bytes[i]! % TOKEN_ALPHABET.length];
  }
  return out;
}

export function buildKeyPrefix(environment: ClientApiKeyEnvironment, randomPart: string): string {
  const base =
    environment === "production" ? `tlv_live_${randomPart}` : `tlv_test_${randomPart}`;
  return base.slice(0, API_KEY_PREFIX_LENGTH);
}

export function generateApiKey(environment: ClientApiKeyEnvironment): string {
  const randomPart = randomToken(API_KEY_TOKEN_LENGTH);
  const prefix =
    environment === "production" ? "tlv_live_" : "tlv_test_";
  return `${prefix}${randomPart}`;
}

export function extractKeyPrefix(apiKey: string): string {
  return apiKey.trim().slice(0, API_KEY_PREFIX_LENGTH);
}

export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  const head = trimmed.startsWith("tlv_test_") ? "tlv_test_" : "tlv_live_";
  const suffix = trimmed.length >= 4 ? trimmed.slice(-4) : "????";
  return `${head}${"•".repeat(12)}${suffix}`;
}

export function hashApiKey(apiKey: string): string {
  const pepper = getPepper();
  return crypto.createHmac("sha256", pepper).update(apiKey.trim()).digest("hex");
}

export function safeCompareApiKeyHash(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
