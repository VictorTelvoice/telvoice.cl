import { randomUUID } from "node:crypto";
import type { AgentCsvParseResult } from "./agentPanelCsvService.js";

export type StoredCsvUpload = {
  id: string;
  companyId: string;
  sessionId: string;
  userId: string | null;
  parsed: AgentCsvParseResult;
  createdAt: number;
  expiresAt: number;
};

const TTL_MS = 15 * 60 * 1000;
const store = new Map<string, StoredCsvUpload>();

export function saveAgentCsvUpload(input: {
  companyId: string;
  sessionId: string;
  userId: string | null;
  parsed: AgentCsvParseResult;
}): StoredCsvUpload {
  const id = randomUUID();
  const createdAt = Date.now();
  const entry: StoredCsvUpload = {
    id,
    companyId: input.companyId,
    sessionId: input.sessionId,
    userId: input.userId,
    parsed: input.parsed,
    createdAt,
    expiresAt: createdAt + TTL_MS,
  };
  store.set(id, entry);
  pruneExpired();
  return entry;
}

export function getAgentCsvUpload(
  uploadId: string,
  companyId: string,
): StoredCsvUpload | null {
  pruneExpired();
  const row = store.get(uploadId);
  if (!row || row.companyId !== companyId) {
    return null;
  }
  if (Date.now() > row.expiresAt) {
    store.delete(uploadId);
    return null;
  }
  return row;
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [id, row] of store) {
    if (now > row.expiresAt) {
      store.delete(id);
    }
  }
}
