export type ApiStatus = "Activa" | "Pausada" | "Pendiente";
export type WebhookStatus = "No configurado" | "Activo" | "Error";
export type ApiEnvironment = "Producción" | "Sandbox";
export type WebhookEvent = "delivered" | "failed" | "expired" | "rejected";

export const WEBHOOK_EVENTS: readonly WebhookEvent[] = [
  "delivered",
  "failed",
  "expired",
  "rejected",
] as const;

export type ClientApiSettings = {
  apiStatus: ApiStatus;
  apiKeyDemo: string;
  apiKeyMasked: string;
  apiKeyLabel: string | null;
  environment: ApiEnvironment;
  createdAt: string;
  lastUsedLabel: string;
  webhookUrl: string;
  webhookStatus: WebhookStatus;
  webhookEvents: Record<WebhookEvent, boolean>;
  smppRequested: boolean;
  smppRequestedAt: string | null;
};

export type ClientApiSettingsRow = {
  id: string;
  company_id: string;
  user_id: string | null;
  api_status: string;
  api_key_label: string | null;
  api_key_masked: string | null;
  api_key_demo: string | null;
  environment: string;
  webhook_url: string | null;
  webhook_status: string;
  webhook_events: unknown;
  smpp_requested: boolean;
  smpp_requested_at: string | null;
  metadata: Record<string, unknown> | null;
  source: string;
  created_at: string;
  updated_at: string;
};

export type ClientApiSettingsInput = {
  companyId: string;
  userId?: string | null;
  settings: ClientApiSettings;
};

export type ClientApiWebhookInput = {
  webhookUrl: string;
  webhookEvents: WebhookEvent[];
};

export type ClientApiModuleState = {
  available: boolean;
  migrationPending: boolean;
};

export type ClientApiServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; missingTable?: boolean };

export type AppApiPageData = {
  module: ClientApiModuleState;
  settings: ClientApiSettings;
  syncSource: "supabase" | "local" | "defaults";
  hasStoredRecord: boolean;
  keysModule?: import("./client-api-keys.js").ClientApiKeysModuleState;
  keys?: import("./client-api-keys.js").ClientApiKey[];
  pepperConfigured?: boolean;
  requestsModule?: import("./client-api-requests.js").ClientApiRequestsModuleState;
  recentApiRequests?: import("./client-api-requests.js").ClientApiRequest[];
};

/** Shape legacy localStorage credenciales (compatibilidad UI). */
export type ClientApiCredentials = {
  apiKey: string;
  environment: "production";
  status: "active";
  createdAt: string;
  lastUsedLabel: string;
};

/** Shape legacy localStorage webhook (compatibilidad UI). */
export type ClientApiWebhookConfig = {
  url: string;
  active: boolean;
  events: Record<WebhookEvent, boolean>;
};
