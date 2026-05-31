import type { CommercialQuoteResult } from "../../types/commercial.js";

export type AgentChannel = "telegram" | "web_client" | "landing" | "admin";

export type AgentIntent =
  | "balance"
  | "recent_messages"
  | "recent_campaigns"
  | "quote_purchase"
  | "commercial"
  | "dlr_help"
  | "segments"
  | "copy_help"
  | "strategy"
  | "campaign_draft"
  | "campaign_cost"
  | "contact_list"
  | "send_sms"
  | "send_sms_flow"
  | "launch_campaign"
  | "knowledge"
  | "capabilities"
  | "confirm"
  | "cancel"
  | "greeting"
  | "reports"
  | "invoices"
  | "wallet"
  | "register"
  | "lead_capture"
  | "confusion"
  | "frustration"
  | "human_contact"
  | "payment"
  | "follow_up"
  | "negative_feedback"
  | "commercial_doubt"
  | "technical_doubt"
  | "unknown";

export type AgentSuggestedAction = {
  label: string;
  message?: string;
  href?: string;
};

export type AgentCoreRequest = {
  channel: AgentChannel;
  message: string;
  sessionId?: string;
  companyId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
};

export type AgentCoreResponse = {
  reply: string;
  intent: AgentIntent | string;
  confidence: number;
  suggestedActions?: AgentSuggestedAction[];
  quote?: CommercialQuoteResult | null;
  requiresConfirmation?: boolean;
  pendingActionId?: string;
  leadRequired?: boolean;
  safeToExecute?: boolean;
  sessionId: string;
};

export type PendingActionType =
  | "send_single_sms"
  | "send_campaign_csv"
  | "launch_campaign"
  | "create_checkout"
  | "send_campaign";

export type PendingActionPayload = Record<string, unknown>;

export type AgentExecutionContext = {
  channel: AgentChannel;
  companyId: string;
  userId: string | null;
  sessionId: string;
  metadata?: Record<string, unknown>;
};
