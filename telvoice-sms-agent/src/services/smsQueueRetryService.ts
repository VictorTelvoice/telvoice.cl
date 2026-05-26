/**
 * Política de reintentos de cola — backoff entre llamadas HTTP al proveedor.
 */

/** Bloquea envío si ya se agotaron intentos (antes de incrementar attempts). */
export function isAttemptExhausted(
  attempts: number,
  maxAttempts: number,
): boolean {
  const max = Math.max(1, maxAttempts);
  return attempts >= max;
}

/**
 * Espera mínima antes del siguiente intento tras fallar el intento N.
 * N = valor de attempts tras markProcessing (1 = primer envío fallido).
 */
export function getRetryDelayMs(completedAttemptNumber: number): number {
  if (completedAttemptNumber <= 1) {
    return 60_000;
  }
  if (completedAttemptNumber === 2) {
    return 180_000;
  }
  return 180_000;
}

export function computeNextScheduledAt(
  completedAttemptNumber: number,
  nowMs = Date.now(),
): string {
  return new Date(nowMs + getRetryDelayMs(completedAttemptNumber)).toISOString();
}
