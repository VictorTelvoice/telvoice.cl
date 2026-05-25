import { createHmac, timingSafeEqual } from "node:crypto";

/** Verifica X-Telsim-Signature según documentación Telsim (HMAC-SHA256 del JSON del body). */
export function verifyTelsimSignature(input: {
  secret: string;
  signatureHeader: string | undefined;
  body?: Record<string, unknown>;
  /** Body exacto recibido (preferido para coincidir con la firma de Telsim). */
  rawBody?: string;
}): boolean {
  const signature = input.signatureHeader?.trim();
  if (!signature || !input.secret) {
    return false;
  }

  const payload =
    input.rawBody?.trim() ||
    (input.body != null ? JSON.stringify(input.body) : "");
  if (!payload) {
    return false;
  }

  const expected = createHmac("sha256", input.secret).update(payload).digest("hex");

  try {
    const sigBuf = Buffer.from(signature, "utf8");
    const expBuf = Buffer.from(expected, "utf8");
    if (sigBuf.length !== expBuf.length) {
      return false;
    }
    return timingSafeEqual(sigBuf, expBuf);
  } catch {
    return signature === expected;
  }
}
