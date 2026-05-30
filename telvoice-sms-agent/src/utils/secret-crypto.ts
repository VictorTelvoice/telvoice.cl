import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { env, isProduction } from "../config/env.js";
import { ValidationError } from "./errors.js";

/** Mensaje admin cuando falta ENCRYPTION_KEY en producción. */
export const SMPP_ENCRYPTION_KEY_MISSING_MESSAGE =
  "SMPP encryption key is not configured. Configure ENCRYPTION_KEY before saving SMPP credentials.";

/** Mensaje admin cuando ENCRYPTION_KEY es demasiado corta en producción. */
export const SMPP_ENCRYPTION_KEY_WEAK_MESSAGE =
  "ENCRYPTION_KEY is too short. Use at least 32 characters for production SMPP credential encryption.";

/** Mensaje admin cuando no se puede descifrar (sin detalles internos). */
export const SMPP_CREDENTIALS_UNAVAILABLE_MESSAGE =
  "SMPP credentials are unavailable. Configure ENCRYPTION_KEY or re-save the connection password.";

const DEV_FALLBACK_KEY = "telvoice-dev-claim-token-encryption-key";

/** Longitud mínima recomendada para ENCRYPTION_KEY en producción (caracteres). */
export const SMPP_ENCRYPTION_KEY_MIN_LENGTH = 32;

/**
 * Runtime productivo: `NODE_ENV=production` (ver `isProduction()` en config/env.ts).
 * En VPS/PM2 debe exportarse NODE_ENV=production junto con ENCRYPTION_KEY en .env.
 */
export function isProductionRuntime(): boolean {
  return isProduction();
}

function normalizedEncryptionKey(): string {
  return env.encryptionKey?.trim() ?? "";
}

function assertProductionEncryptionKeyPresent(): void {
  if (!isProductionRuntime()) return;
  if (!normalizedEncryptionKey()) {
    throw new ValidationError(SMPP_ENCRYPTION_KEY_MISSING_MESSAGE);
  }
}

function assertEncryptionKeyStrength(key: string): void {
  if (!isProductionRuntime()) return;
  if (key.length < SMPP_ENCRYPTION_KEY_MIN_LENGTH) {
    throw new ValidationError(SMPP_ENCRYPTION_KEY_WEAK_MESSAGE);
  }
}

function resolveEncryptionKeyMaterial(): string {
  const configured = normalizedEncryptionKey();

  if (isProductionRuntime()) {
    if (!configured) {
      throw new ValidationError(SMPP_ENCRYPTION_KEY_MISSING_MESSAGE);
    }
    assertEncryptionKeyStrength(configured);
    return configured;
  }

  if (configured) {
    return configured;
  }

  return DEV_FALLBACK_KEY;
}

function deriveEncryptionKey(keyMaterial: string): Buffer {
  return createHash("sha256").update(keyMaterial).digest();
}

/**
 * Cifra un secreto SMPP (AES-256-GCM).
 * En producción exige ENCRYPTION_KEY válida; en desarrollo local permite fallback dev.
 */
export function encryptSmppSecret(plaintext: string): string {
  assertProductionEncryptionKeyPresent();
  const keyMaterial = resolveEncryptionKeyMaterial();
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    deriveEncryptionKey(keyMaterial),
    iv,
  );
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    enc.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

/**
 * Descifra un secreto SMPP guardado con {@link encryptSmppSecret}.
 * En producción exige ENCRYPTION_KEY; falla de forma controlada si no puede descifrar.
 */
export function decryptSmppSecret(payload: string): string {
  assertProductionEncryptionKeyPresent();
  const keyMaterial = resolveEncryptionKeyMaterial();

  try {
    const [ivB64, encB64, tagB64] = payload.split(".");
    if (!ivB64 || !encB64 || !tagB64) {
      throw new ValidationError(SMPP_CREDENTIALS_UNAVAILABLE_MESSAGE);
    }
    const iv = Buffer.from(ivB64, "base64url");
    const enc = Buffer.from(encB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveEncryptionKey(keyMaterial),
      iv,
    );
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
      "utf8",
    );
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(SMPP_CREDENTIALS_UNAVAILABLE_MESSAGE);
  }
}

/** @deprecated Use encryptSmppSecret — mantiene compatibilidad interna. */
export function encryptSecret(plaintext: string): string {
  return encryptSmppSecret(plaintext);
}

/** @deprecated Use decryptSmppSecret — mantiene compatibilidad interna. */
export function decryptSecret(payload: string): string | null {
  try {
    return decryptSmppSecret(payload);
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    return null;
  }
}
