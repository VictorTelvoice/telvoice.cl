import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { env } from "../config/env.js";

export function generateClaimToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashClaimToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function deriveEncryptionKey(): Buffer {
  const raw =
    env.encryptionKey?.trim() ||
    "telvoice-dev-claim-token-encryption-key";
  return createHash("sha256").update(raw).digest();
}

export function encryptClaimTokenForMetadata(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveEncryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    enc.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptClaimTokenFromMetadata(payload: string): string | null {
  try {
    const [ivB64, encB64, tagB64] = payload.split(".");
    if (!ivB64 || !encB64 || !tagB64) {
      return null;
    }
    const iv = Buffer.from(ivB64, "base64url");
    const enc = Buffer.from(encB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", deriveEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    return null;
  }
}

export function buildClaimActivationUrl(claimToken: string): string {
  const base = env.publicAppUrl.replace(/\/$/, "");
  return `${base}/login?claim_token=${encodeURIComponent(claimToken)}`;
}

export function generatePublicCheckoutReference(): string {
  return `TV-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}
