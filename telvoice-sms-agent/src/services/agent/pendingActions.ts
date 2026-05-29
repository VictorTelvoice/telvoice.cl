import { randomUUID } from "node:crypto";
import type {
  AgentExecutionContext,
  PendingActionPayload,
  PendingActionType,
} from "./types.js";

const TTL_MS = 15 * 60 * 1000;

export type StoredPendingAction = {
  id: string;
  type: PendingActionType;
  summary: string;
  payload: PendingActionPayload;
  context: AgentExecutionContext;
  createdAt: number;
  expiresAt: number;
};

const store = new Map<string, StoredPendingAction>();

function purgeExpired(): void {
  const now = Date.now();
  for (const [id, row] of store) {
    if (row.expiresAt <= now) {
      store.delete(id);
    }
  }
}

export function createPendingAction(input: {
  type: PendingActionType;
  summary: string;
  payload: PendingActionPayload;
  context: AgentExecutionContext;
}): StoredPendingAction {
  purgeExpired();
  const id = randomUUID();
  const createdAt = Date.now();
  const row: StoredPendingAction = {
    id,
    type: input.type,
    summary: input.summary,
    payload: input.payload,
    context: input.context,
    createdAt,
    expiresAt: createdAt + TTL_MS,
  };
  store.set(id, row);
  return row;
}

export function getPendingAction(id: string): StoredPendingAction | null {
  purgeExpired();
  const row = store.get(id);
  if (!row || row.expiresAt <= Date.now()) {
    store.delete(id);
    return null;
  }
  return row;
}

export function clearPendingAction(id: string): void {
  store.delete(id);
}

export function findPendingForSession(
  sessionId: string,
  companyId: string,
): StoredPendingAction | null {
  purgeExpired();
  for (const row of store.values()) {
    if (
      row.context.sessionId === sessionId &&
      row.context.companyId === companyId
    ) {
      return row;
    }
  }
  return null;
}
