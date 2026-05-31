import type { ConversationMemory } from "./agentConversationMemory.js";
import type { AgentCoreResponse } from "./types.js";

/** Pasos del flujo guiado SMS/campaña en panel cliente. */
export const SEND_SMS_FLOW_STEP = {
  NEED_MESSAGE: "need_message",
  NEED_RECIPIENT_OR_CSV: "need_recipient_or_csv",
  NEED_CSV_FILE: "need_csv_file",
  REVIEW_SINGLE_SMS: "review_single_sms",
  REVIEW_CAMPAIGN_CSV: "review_campaign_csv",
} as const;

export type SendSmsFlowStep =
  (typeof SEND_SMS_FLOW_STEP)[keyof typeof SEND_SMS_FLOW_STEP];

export function isFlowExitCommand(message: string): boolean {
  return /^(cancelar|cancelo|salir|cerrar|terminar|no confirmo|anular|detener)\b/i.test(
    message.trim(),
  );
}

export function isActiveSendSmsFlow(memory: ConversationMemory): boolean {
  return Boolean(
    memory.sendSmsFlowActive ||
      memory.waitingForMessage ||
      memory.waitingForRecipient ||
      memory.waitingForCsv ||
      memory.sendSmsFlowStep ||
      memory.pendingSmsMessage,
  );
}

/** Priorizar flujo sobre knowledge u otros intents ambiguos. */
export function shouldForceSendSmsFlow(memory: ConversationMemory): boolean {
  if (memory.waitingForMessage === true) {
    return true;
  }
  if (
    memory.sendSmsFlowStep === SEND_SMS_FLOW_STEP.NEED_RECIPIENT_OR_CSV ||
    memory.sendSmsFlowStep === SEND_SMS_FLOW_STEP.NEED_CSV_FILE ||
    memory.sendSmsFlowStep === SEND_SMS_FLOW_STEP.REVIEW_CAMPAIGN_CSV
  ) {
    return true;
  }
  if (
    memory.waitingForRecipient === true ||
    memory.waitingForCsv === true
  ) {
    return Boolean(memory.pendingSmsMessage);
  }
  return false;
}

export function shouldSkipKnowledgeForSendFlow(
  memory: ConversationMemory,
  responseIntent?: string,
): boolean {
  if (responseIntent === "send_sms_flow" || responseIntent === "confirm") {
    return true;
  }
  return shouldForceSendSmsFlow(memory) || isActiveSendSmsFlow(memory);
}

/**
 * Botón/ícono adjuntar CSV en el widget: solo en pasos que permiten CSV.
 */
export function shouldShowCsvAttachButton(
  memory: ConversationMemory,
): boolean {
  const step = memory.sendSmsFlowStep;
  if (step === SEND_SMS_FLOW_STEP.NEED_RECIPIENT_OR_CSV) {
    return true;
  }
  if (step === SEND_SMS_FLOW_STEP.NEED_CSV_FILE) {
    return true;
  }
  if (step === SEND_SMS_FLOW_STEP.REVIEW_CAMPAIGN_CSV) {
    return true;
  }
  if (memory.pendingCsvUploadId && memory.pendingSmsMessage) {
    return true;
  }
  return false;
}

export function enrichPanelFlowUi(
  response: AgentCoreResponse,
  memory: ConversationMemory,
): AgentCoreResponse {
  const showAttach =
    response.showAttachButton ??
    shouldShowCsvAttachButton(memory);
  return {
    ...response,
    showAttachButton: showAttach,
    sendSmsFlowStep: memory.sendSmsFlowStep ?? response.sendSmsFlowStep,
  };
}
