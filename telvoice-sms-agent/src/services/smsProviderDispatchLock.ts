/**
 * Serialización en proceso: un SendSMS a la vez por proveedor (aSMSC).
 * Evita respuestas engañosas «IP not Whitelisted» por concurrencia.
 */
const held = new Set<string>();

export function tryAcquireProviderDispatchLock(providerId: string): boolean {
  if (!providerId) {
    return true;
  }
  if (held.has(providerId)) {
    return false;
  }
  held.add(providerId);
  return true;
}

export function releaseProviderDispatchLock(providerId: string): void {
  if (providerId) {
    held.delete(providerId);
  }
}

/** Solo para QA/tests en proceso. */
export function resetProviderDispatchLocksForTest(): void {
  held.clear();
}

export function isProviderDispatchLocked(providerId: string): boolean {
  return held.has(providerId);
}
