export interface PendingLeadCapture {
  telegram_user_id: number;
  chat_id: number;
  step: "name" | "contact" | "quantity" | "use_case";
  name?: string;
  company?: string;
  contact?: string;
  requested_quantity?: number;
  use_case?: string;
  created_at: number;
}

const TTL_MS = 15 * 60 * 1000;
const pending = new Map<number, PendingLeadCapture>();

export function getPendingLead(userId: number): PendingLeadCapture | null {
  const entry = pending.get(userId);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.created_at > TTL_MS) {
    pending.delete(userId);
    return null;
  }
  return entry;
}

export function setPendingLead(entry: PendingLeadCapture): void {
  pending.set(entry.telegram_user_id, entry);
}

export function clearPendingLead(userId: number): boolean {
  return pending.delete(userId);
}
