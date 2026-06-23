import { isPureGreeting } from "./agentGreetingReset.js";
import { isFlowExitCommand } from "./agentSendSmsFlowUi.js";
import { SEND_SMS_FLOW_STEP } from "./agentSendSmsFlowUi.js";
import { PURCHASE_FLOW_STEP } from "./agentPurchaseFlow.js";
import type { ConversationMemory } from "./agentConversationMemory.js";
import type { AgentChannel, AgentIntent } from "./types.js";

export type AgentMode =
  | "operational"
  | "commercial"
  | "support"
  | "training"
  | "idle";

export type RouterDecision = {
  user_text: string;
  normalized_text: string;
  current_flow_step: string | null;
  detected_intent: string;
  selected_handler: string;
  knowledge_allowed: boolean;
  reason: string;
  response_type: string;
  agent_mode: AgentMode;
};

const OPERATIONAL_SEND_STEPS = new Set<string>([
  SEND_SMS_FLOW_STEP.NEED_MESSAGE,
  SEND_SMS_FLOW_STEP.NEED_RECIPIENT_OR_CSV,
  SEND_SMS_FLOW_STEP.NEED_CSV_FILE,
  SEND_SMS_FLOW_STEP.REVIEW_SINGLE_SMS,
  SEND_SMS_FLOW_STEP.REVIEW_CAMPAIGN_CSV,
  "awaiting_confirm",
]);

const OPERATIONAL_PURCHASE_STEPS = new Set<string>([
  PURCHASE_FLOW_STEP.NEED_QUANTITY,
  PURCHASE_FLOW_STEP.REVIEW_QUOTE,
  PURCHASE_FLOW_STEP.PAYMENT_READY,
  PURCHASE_FLOW_STEP.MANUAL_QUOTE_REQUIRED,
  PURCHASE_FLOW_STEP.INSUFFICIENT_SEND,
]);

const FEEDBACK_SUPPRESSED_STEPS = new Set<string>([
  SEND_SMS_FLOW_STEP.NEED_MESSAGE,
  SEND_SMS_FLOW_STEP.NEED_RECIPIENT_OR_CSV,
  SEND_SMS_FLOW_STEP.NEED_CSV_FILE,
  SEND_SMS_FLOW_STEP.REVIEW_SINGLE_SMS,
  SEND_SMS_FLOW_STEP.REVIEW_CAMPAIGN_CSV,
  "awaiting_confirm",
  PURCHASE_FLOW_STEP.NEED_QUANTITY,
  PURCHASE_FLOW_STEP.REVIEW_QUOTE,
  PURCHASE_FLOW_STEP.PAYMENT_READY,
]);

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isOperationalFlowActive(memory: ConversationMemory): boolean {
  if (memory.waitingForMessage === true) {
    return true;
  }
  if (memory.waitingForRecipient === true || memory.waitingForCsv === true) {
    return true;
  }
  if (memory.sendSmsFlowStep && OPERATIONAL_SEND_STEPS.has(memory.sendSmsFlowStep)) {
    return true;
  }
  if (memory.purchaseFlowStep && OPERATIONAL_PURCHASE_STEPS.has(memory.purchaseFlowStep)) {
    return true;
  }
  if (memory.sendSmsFlowActive === true && memory.pendingSmsMessage) {
    return true;
  }
  if (memory.blockedSendDueToBalance) {
    return true;
  }
  return false;
}

export function resolveAgentMode(memory: ConversationMemory): AgentMode {
  if (
    memory.sendSmsFlowActive ||
    memory.waitingForMessage ||
    memory.waitingForRecipient ||
    memory.waitingForCsv ||
    (memory.sendSmsFlowStep && OPERATIONAL_SEND_STEPS.has(memory.sendSmsFlowStep))
  ) {
    return "operational";
  }
  if (
    memory.purchaseFlowStep &&
    OPERATIONAL_PURCHASE_STEPS.has(memory.purchaseFlowStep)
  ) {
    return "commercial";
  }
  if (memory.lastIntent === "dlr_help" || memory.lastIntent === "knowledge") {
    return "support";
  }
  return "idle";
}

/**
 * Si el agente pidió el mensaje SMS, el siguiente texto del usuario es el cuerpo del SMS.
 */
export function shouldTreatUserTextAsSmsMessage(
  memory: ConversationMemory,
  text: string,
): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  const waiting =
    memory.waitingForMessage === true ||
    memory.sendSmsFlowStep === SEND_SMS_FLOW_STEP.NEED_MESSAGE;
  if (!waiting) {
    return false;
  }
  if (isFlowExitCommand(trimmed)) {
    return false;
  }
  if (isPureGreeting(trimmed)) {
    return false;
  }
  return true;
}

export function canUseKnowledgeSearch(
  channel: AgentChannel,
  memory: ConversationMemory,
  intent: AgentIntent | string,
): boolean {
  if (channel === "admin") {
    return true;
  }
  if (memory.waitingForMessage === true) {
    return false;
  }
  if (memory.waitingForRecipient === true || memory.waitingForCsv === true) {
    return false;
  }
  const step = memory.sendSmsFlowStep;
  if (
    step === SEND_SMS_FLOW_STEP.REVIEW_SINGLE_SMS ||
    step === SEND_SMS_FLOW_STEP.REVIEW_CAMPAIGN_CSV ||
    step === SEND_SMS_FLOW_STEP.NEED_RECIPIENT_OR_CSV ||
    step === SEND_SMS_FLOW_STEP.NEED_CSV_FILE
  ) {
    return false;
  }
  if (
    memory.purchaseFlowStep === PURCHASE_FLOW_STEP.REVIEW_QUOTE ||
    memory.purchaseFlowStep === PURCHASE_FLOW_STEP.PAYMENT_READY ||
    memory.purchaseFlowStep === PURCHASE_FLOW_STEP.NEED_QUANTITY
  ) {
    return false;
  }
  if (isOperationalFlowActive(memory)) {
    return false;
  }
  const knowledgeIntents = new Set([
    "knowledge",
    "inbound_sms_knowledge",
    "dlr_help",
    "technical_doubt",
    "support",
    "faq",
  ]);
  if (!knowledgeIntents.has(String(intent)) && intent !== "unknown") {
    return false;
  }
  return true;
}

export function shouldSuppressKnowledgeIntent(
  memory: ConversationMemory,
  intent: AgentIntent | string,
): boolean {
  const blocked = new Set([
    "knowledge",
    "inbound_sms_knowledge",
    "dlr_help",
    "technical_doubt",
    "strategy",
    "copy_help",
  ]);
  if (!blocked.has(String(intent))) {
    return false;
  }
  return isOperationalFlowActive(memory) || memory.waitingForMessage === true;
}

export function shouldShowFeedbackButtons(
  memory: ConversationMemory,
  intent: AgentIntent | string,
  flowStep?: string | null,
): boolean {
  const step = flowStep ?? memory.sendSmsFlowStep ?? memory.purchaseFlowStep ?? null;
  if (step && FEEDBACK_SUPPRESSED_STEPS.has(step)) {
    return false;
  }
  if (
    memory.waitingForMessage ||
    memory.waitingForRecipient ||
    memory.waitingForCsv
  ) {
    return false;
  }
  const operationalIntents = new Set([
    "send_sms_flow",
    "send_sms",
    "confirm",
    "quote_purchase",
  ]);
  if (operationalIntents.has(String(intent)) && isOperationalFlowActive(memory)) {
    return false;
  }
  const feedbackOk = new Set([
    "knowledge",
    "inbound_sms_knowledge",
    "dlr_help",
    "negative_feedback",
    "cancel",
    "confirm",
    "unknown",
  ]);
  if (feedbackOk.has(String(intent))) {
    return true;
  }
  if (!isOperationalFlowActive(memory) && intent !== "send_sms_flow") {
    return true;
  }
  return false;
}

export function logRouterDecision(decision: RouterDecision): void {
  console.info("[agentRouter]", JSON.stringify(decision));
}

export function buildRouterDecision(
  partial: Omit<RouterDecision, "normalized_text"> & { normalized_text?: string },
): RouterDecision {
  return {
    ...partial,
    normalized_text: partial.normalized_text ?? normalizeText(partial.user_text),
  };
}
