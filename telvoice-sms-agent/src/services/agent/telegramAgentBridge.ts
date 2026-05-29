import type { AuthorizedTelegramClient } from "../telegramAuthorizationService.js";
import { runAgentCore } from "./agentCore.js";
import type { AgentCoreResponse } from "./types.js";

export type TelegramAgentTurnResult = {
  reply: string;
  useLegacyEnviarFlow: boolean;
  coreResponse?: AgentCoreResponse;
};

/** Procesa texto libre de Telegram vía Agent Core (salvo flujos legacy de envío con código). */
export async function runTelegramAgentTurn(input: {
  chatId: number;
  userId: number;
  text: string;
  command?: string;
  auth: AuthorizedTelegramClient | null;
  telegramFirstName?: string;
}): Promise<TelegramAgentTurnResult> {
  const normalized = input.text.trim().toLowerCase();

  if (/^enviar\s+/.test(normalized) && input.auth) {
    return { reply: "", useLegacyEnviarFlow: true };
  }

  const result = await runAgentCore({
    channel: "telegram",
    message: input.text,
    sessionId: `tg-${input.chatId}`,
    companyId: input.auth?.client.id ?? null,
    userId: String(input.userId),
    metadata: {
      command: input.command ?? "",
      authorized: !!input.auth,
      telegramAuthorized: !!input.auth,
      telegramChatId: input.chatId,
      telegramUserId: input.userId,
      telegramFirstName: input.telegramFirstName,
      resolvedCompanyId: input.auth?.client.id,
    },
  });

  return {
    reply: result.reply,
    useLegacyEnviarFlow: false,
    coreResponse: result,
  };
}
