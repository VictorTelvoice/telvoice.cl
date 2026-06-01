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
  /** primary = botón destacado (p. ej. Abrir borrador) */
  variant?: "primary" | "secondary";
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
  /** Panel: limpiar chip CSV del widget tras confirmación exitosa */
  clearCsvUpload?: boolean;
  /** Panel: cerrar chat tras salir sin flujo activo */
  closeWidget?: boolean;
  /** Panel: mostrar botón adjuntar CSV en el input del widget */
  showAttachButton?: boolean;
  /** Panel: paso actual del flujo SMS/campaña (para UI) */
  sendSmsFlowStep?: string;
  /** Panel: URL checkout MercadoPago desde agente */
  paymentUrl?: string | null;
  orderId?: string | null;
  /** Panel: botón destacado de pago en widget */
  showPaymentButton?: boolean;
  /** Panel: reiniciar flujo local (pending action, CSV) tras saludo puro */
  resetFlow?: boolean;
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
