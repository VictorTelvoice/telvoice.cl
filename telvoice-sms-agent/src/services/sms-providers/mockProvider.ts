import { sendViaMockProvider } from "../mockSmsProviderService.js";
import type { SmsProviderSendInput, SmsProviderSendResult } from "./types.js";

export async function sendMessageMock(
  input: SmsProviderSendInput,
): Promise<SmsProviderSendResult> {
  const result = sendViaMockProvider({
    to: input.to,
    from: input.senderId,
    message: input.message,
    segments: Number(input.metadata?.segments ?? 1),
  });

  return {
    provider: "mock",
    provider_message_id: result.providerMessageId,
    status: "sent",
    raw_response: {
      mode: "mock",
      operator: result.operator,
      simulated: true,
      delivered_at: result.deliveredAt,
    },
    accepted: true,
  };
}
