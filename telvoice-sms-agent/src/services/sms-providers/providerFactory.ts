import { sendMessageMock } from "./mockProvider.js";
import { sendMessageRealApi } from "./realApiProvider.js";
import type {
  SmsProviderName,
  SmsProviderSendInput,
  SmsProviderSendResult,
} from "./types.js";

export async function sendViaProvider(
  providerName: SmsProviderName,
  input: SmsProviderSendInput,
): Promise<SmsProviderSendResult> {
  if (providerName === "mock") {
    return sendMessageMock(input);
  }
  return sendMessageRealApi(input);
}
