import type { SmsProviderRow } from "../types/sms-routing.js";
import { AppError } from "../utils/errors.js";
import { sendMessageMock } from "./sms-providers/mockProvider.js";
import { sendMessageRealApi } from "./sms-providers/realApiProvider.js";
import type { SmsProviderSendInput, SmsProviderSendResult } from "./sms-providers/types.js";

/** Envía por el adapter del proveedor configurado (credenciales desde .env). */
export async function dispatchProviderSend(
  provider: SmsProviderRow,
  input: SmsProviderSendInput,
): Promise<SmsProviderSendResult> {
  const code = provider.code.toLowerCase();

  if (code === "mock") {
    return sendMessageMock(input);
  }

  if (code === "asmsc" || code === "almuqeet" || provider.type === "http_api") {
    const senderId =
      input.senderId ||
      provider.default_sender_id ||
      input.metadata?.fallbackSenderId?.toString() ||
      "TELVOICE";

    return sendMessageRealApi({
      ...input,
      senderId,
      metadata: {
        ...input.metadata,
        provider_code: provider.code,
        provider_id: provider.id,
      },
    });
  }

  throw new AppError(`Proveedor «${provider.code}» sin adapter implementado.`, 501);
}
