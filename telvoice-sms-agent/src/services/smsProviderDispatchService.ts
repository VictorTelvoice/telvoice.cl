import type { SmsProviderRow } from "../types/sms-routing.js";
import { AppError } from "../utils/errors.js";
import {
  isHttpApiProviderConfigured,
  resolveHttpApiCredentials,
} from "./providerCredentialsService.js";
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
    const creds = resolveHttpApiCredentials(provider);
    const senderId =
      input.senderId ||
      provider.default_sender_id ||
      input.metadata?.fallbackSenderId?.toString() ||
      creds.defaultSenderId ||
      "TELVOICE";

    if (!isHttpApiProviderConfigured(provider)) {
      return {
        provider: provider.code,
        provider_message_id: null,
        status: "failed",
        raw_response: {},
        accepted: false,
        error_code: "PROVIDER_NOT_CONFIGURED",
        error_message: `Configure ${creds.envPrefix}_API_ID y ${creds.envPrefix}_API_PASSWORD en el servidor.`,
      };
    }

    return sendMessageRealApi({
      ...input,
      senderId,
      metadata: {
        ...input.metadata,
        provider_code: provider.code,
        provider_id: provider.id,
        http_api_credentials: creds,
      },
    });
  }

  throw new AppError(`Proveedor «${provider.code}» sin adapter implementado.`, 501);
}
