import type { ClientApiKey } from "./client-api-keys.js";

export type ClientApiProductionBlockingReason =
  | "company_inactive"
  | "wallet_inactive"
  | "missing_rate_plan"
  | "api_not_enabled"
  | "no_active_api_key"
  | "missing_production_approval"
  | "insufficient_scopes"
  | "qa_demo_account";

export const CLIENT_API_PRODUCTION_BLOCKING_LABELS: Record<
  ClientApiProductionBlockingReason,
  string
> = {
  company_inactive: "Tu cuenta no está activa para envíos.",
  wallet_inactive: "Tu wallet no está activa.",
  missing_rate_plan: "No tienes un plan de tarifas asignado.",
  api_not_enabled: "Tu rate plan aún no permite envío API.",
  no_active_api_key: "No tienes API key activa.",
  missing_production_approval: "Falta aprobación productiva de tu API key.",
  insufficient_scopes: "Scopes insuficientes en tu API key (se requiere sms:send).",
  qa_demo_account:
    "Las cuentas QA/demo no pueden enviar SMS productivos por API.",
};

export type ClientApiProductionStatus = {
  apiEnabled: boolean;
  hasActiveApiKey: boolean;
  hasProductionApprovedKey: boolean;
  hasProductionApprovedActiveKey: boolean;
  canUseProductionApi: boolean;
  canSendApiSms: boolean;
  blockingReasons: ClientApiProductionBlockingReason[];
  walletActive: boolean;
  companyActive: boolean;
  ratePlanAssigned: boolean;
  /** Key usada para evaluar producción (activa + aprobada + sms:send). */
  primaryProductionKeyId: string | null;
  primaryProductionKeyPrefix: string | null;
};

export type ClientApiKeysModulePayload = {
  ok: true;
  keys: ClientApiKey[];
  pepperConfigured: boolean;
  productionStatus: ClientApiProductionStatus;
};
