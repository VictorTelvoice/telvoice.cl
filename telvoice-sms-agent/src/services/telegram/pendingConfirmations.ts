export interface PendingSmsConfirmation {
  telegram_user_id: number;
  chat_id: number;
  phonenumber: string;
  textmessage: string;
  sender_id: string;
  sms_type: string;
  encoding: string;
  confirmation_code: string;
  created_at: number;
}

const CONFIRMATION_TTL_MS = 5 * 60 * 1000;
const pendingByUser = new Map<number, PendingSmsConfirmation>();

export function setPendingConfirmation(
  data: PendingSmsConfirmation,
): void {
  pendingByUser.set(data.telegram_user_id, data);
}

export function getPendingConfirmation(
  userId: number,
): PendingSmsConfirmation | null {
  const entry = pendingByUser.get(userId);
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.created_at > CONFIRMATION_TTL_MS) {
    pendingByUser.delete(userId);
    return null;
  }

  return entry;
}

export function clearPendingConfirmation(userId: number): boolean {
  return pendingByUser.delete(userId);
}

export function generateConfirmationCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}
