import { randomUUID } from "node:crypto";

export type MockProviderSendInput = {
  to: string;
  from: string;
  message: string;
  segments: number;
};

export type MockProviderSendResult = {
  providerMessageId: string;
  status: "sent";
  operator: string;
  sentAt: string;
  deliveredAt: null;
};

/** Simula envío a operador; no contacta SMPP ni Almuqeet. */
export function sendViaMockProvider(
  input: MockProviderSendInput,
): MockProviderSendResult {
  const now = new Date().toISOString();
  const operator = input.to.startsWith("+569") ? "movistar_cl_mock" : "unknown_cl_mock";

  return {
    providerMessageId: `mock-${randomUUID()}`,
    status: "sent",
    operator,
    sentAt: now,
    deliveredAt: null,
  };
}
