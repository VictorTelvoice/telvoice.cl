import type { TelegramBotInfo } from "../../types/telegram.js";

let lastError: string | null = null;
let botInfo: TelegramBotInfo | null = null;
let pollingActive = false;

export function setTelegramLastError(message: string | null): void {
  lastError = message;
}

export function setTelegramBotInfo(info: TelegramBotInfo | null): void {
  botInfo = info;
}

export function setTelegramPollingActive(active: boolean): void {
  pollingActive = active;
}

export function getTelegramRuntimeStatus() {
  return {
    lastError,
    botInfo,
    pollingActive,
  };
}
