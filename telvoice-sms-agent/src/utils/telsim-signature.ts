import { createHmac, timingSafeEqual } from "node:crypto";

/** Verifica X-Telsim-Signature según documentación Telsim (HMAC-SHA256 del JSON del body). */
export function verifyTelsimSignature(input: {
  secret: string;
  signatureHeader: string | undefined;
  body: Record<string, unknown>;
}): boolean {
  const signature = input.signatureHeader?.trim();
  if (!signature || !input.secret) {
    return false;
  }

  const body = JSON.stringify(input.body);
  const expected = createHmac("sha256", input.secret).update(body).digest("hex");

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
