import { createHmac, timingSafeEqual } from "node:crypto";

function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqualHex(signature: string, expected: string): boolean {
  const sig = signature.replace(/^sha256=/i, "").trim();
  const exp = expected.trim();
  try {
    const sigBuf = Buffer.from(sig, "utf8");
    const expBuf = Buffer.from(exp, "utf8");
    if (sigBuf.length !== expBuf.length) {
      return false;
    }
    return timingSafeEqual(sigBuf, expBuf);
  } catch {
    return sig === exp;
  }
}

function secretVariants(secret: string): string[] {
  const s = secret.trim();
  const variants = [s];
  if (s.startsWith("whsec_")) {
    variants.push(s.slice("whsec_".length));
  }
  return [...new Set(variants.filter(Boolean))];
}

function payloadVariants(
  rawBody?: string,
  body?: Record<string, unknown>,
): string[] {
  const variants: string[] = [];
  const raw = rawBody?.trim();
  if (raw) {
    variants.push(raw);
  }
  if (body != null) {
    variants.push(JSON.stringify(body));
  }
  return [...new Set(variants)];
}

/** Verifica X-Telsim-Signature (HMAC-SHA256 del body, según docs Telsim). */
export function verifyTelsimSignature(input: {
  secret: string;
  signatureHeader: string | undefined;
  body?: Record<string, unknown>;
  /** Body exacto recibido (preferido). */
  rawBody?: string;
}): boolean {
  const signature = input.signatureHeader?.trim();
  if (!signature || !input.secret) {
    return false;
  }

  const payloads = payloadVariants(input.rawBody, input.body);
  if (!payloads.length) {
    return false;
  }

  for (const secret of secretVariants(input.secret)) {
    for (const payload of payloads) {
      const expected = hmacHex(secret, payload);
      if (safeEqualHex(signature, expected)) {
        return true;
      }
    }
  }

  return false;
}
