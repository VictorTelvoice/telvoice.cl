export type CommercialSessionStep = "awaiting_quantity" | "quoted";

export interface PendingCommercialSession {
  telegram_user_id: number;
  chat_id: number;
  step: CommercialSessionStep;
  quoted_quantity?: number;
  checkout_url?: string | null;
  created_at: number;
}

const TTL_MS = 30 * 60 * 1000;
const sessions = new Map<number, PendingCommercialSession>();

export function getPendingCommercial(
  userId: number,
): PendingCommercialSession | null {
  const entry = sessions.get(userId);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.created_at > TTL_MS) {
    sessions.delete(userId);
    return null;
  }
  return entry;
}

export function setPendingCommercial(
  entry: PendingCommercialSession,
): void {
  sessions.set(entry.telegram_user_id, entry);
}

export function clearPendingCommercial(userId: number): boolean {
  return sessions.delete(userId);
}
