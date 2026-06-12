export type ClientNumberType = "sim_real" | "fixed_line" | "virtual" | "other";

export type ClientNumberStatus =
  | "available"
  | "reserved"
  | "pending_activation"
  | "active"
  | "suspended"
  | "cancelled";

export type AgentPlanCode = "start" | "pro" | "business";

export type AgentPlanRequestStatus =
  | "pending"
  | "reviewing"
  | "approved"
  | "rejected"
  | "activated"
  | "paid_pending_setup";

export type AgentPlanSubscriptionStatus =
  | "pending"
  | "active"
  | "suspended"
  | "cancelled";

export type InboundSmsStatus =
  | "received"
  | "read"
  | "archived"
  | "forwarded"
  | "failed";

export type NumberIntegrationType = "telegram" | "webhook" | "api";

export type NumberIntegrationStatus = "active" | "inactive" | "error";

export type ClientNumberCapabilities = {
  receive_sms?: boolean;
  send_sms?: boolean;
  otp_authorized?: boolean;
  api_webhook?: boolean;
};

export type ClientNumberRow = {
  id: string;
  company_id: string;
  number: string;
  country_code: string | null;
  type: ClientNumberType;
  status: ClientNumberStatus;
  provider: string | null;
  sim_slot: string | null;
  gateway_id: string | null;
  capabilities: ClientNumberCapabilities;
  assigned_agent_id: string | null;
  activated_at: string | null;
  renewed_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientNumberListItem = ClientNumberRow & {
  plan_code: AgentPlanCode | null;
  plan_label: string;
  has_agent: boolean;
  last_sms_at: string | null;
  last_sms_from: string | null;
};

export type InboundSmsMessageRow = {
  id: string;
  company_id: string;
  client_number_id: string;
  to_number: string;
  from_number: string | null;
  body: string;
  detected_otp: string | null;
  received_at: string;
  status: InboundSmsStatus;
  source: string | null;
  raw_payload: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type NumberIntegrationRow = {
  id: string;
  company_id: string;
  client_number_id: string | null;
  type: NumberIntegrationType;
  name: string | null;
  status: NumberIntegrationStatus;
  config: Record<string, unknown>;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentPlanSubscriptionRow = {
  id: string;
  company_id: string;
  plan_code: AgentPlanCode;
  status: AgentPlanSubscriptionStatus;
  monthly_price_clp: number;
  included_number_id: string | null;
  billing_cycle: string;
  starts_at: string | null;
  renews_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentPlanRequestRow = {
  id: string;
  company_id: string;
  plan_code: AgentPlanCode;
  preferred_number_type: "sim_real" | "fixed_line" | "either";
  status: AgentPlanRequestStatus;
  notes: string | null;
  order_id: string | null;
  checkout_email: string | null;
  use_case: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientNumbersModuleState = {
  available: boolean;
  migrationPending: boolean;
};

export type AgentPlanDefinition = {
  code: AgentPlanCode;
  name: string;
  priceClp: number;
  features: string[];
};

export const AGENT_PLAN_DEFINITIONS: AgentPlanDefinition[] = [
  {
    code: "start",
    name: "Agente Start",
    priceClp: 39990,
    features: [
      "1 línea Telvoice incluida",
      "SIM real única o número de red fija según disponibilidad",
      "Agente comercial básico",
      "Recepción SMS",
      "OTP autorizado",
      "Historial de mensajes",
      "Soporte inicial",
    ],
  },
  {
    code: "pro",
    name: "Agente Pro",
    priceClp: 59900,
    features: [
      "1 línea Telvoice incluida",
      "Agente para campañas y validaciones",
      "Envío y recepción SMS",
      "Campañas asistidas",
      "Notificaciones por panel y Telegram",
      "Historial SMS",
      "Reglas básicas de operación",
      "Soporte prioritario",
    ],
  },
  {
    code: "business",
    name: "Agente Business",
    priceClp: 99990,
    features: [
      "1 línea Telvoice incluida",
      "Agente avanzado",
      "Envío y recepción SMS",
      "Validaciones OTP autorizadas",
      "API/webhooks",
      "Telegram",
      "Dashboard con historial y descarga",
      "Multiusuario",
      "Reglas operativas",
      "Soporte prioritario",
    ],
  },
];
