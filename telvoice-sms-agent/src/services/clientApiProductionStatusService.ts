import type { ClientApiKey, ClientApiKeyScope } from "../types/client-api-keys.js";
import {
  CLIENT_API_PRODUCTION_BLOCKING_LABELS,
  type ClientApiProductionBlockingReason,
  type ClientApiProductionStatus,
} from "../types/client-api-production-status.js";
import { findCompanyById } from "./companyService.js";
import { listClientApiKeys } from "./clientApiKeyService.js";
import { listActiveCompanyRatePlans } from "./companyRatePlanService.js";
import { getOrCreateCompanyWallet } from "./smsWalletService.js";

const SEND_SCOPES: ClientApiKeyScope[] = ["sms:send"];

function isActiveProductionKey(key: ClientApiKey): boolean {
  return key.environment === "production" && key.status === "active";
}

function keyHasScopes(key: ClientApiKey, required: ClientApiKeyScope[]): boolean {
  return required.every((s) => key.scopes.includes(s));
}

export function resolveClientApiProductionStatusFromInputs(input: {
  companyStatus: string | null | undefined;
  walletStatus: string | null | undefined;
  ratePlanRows: Array<{ api_enabled?: boolean | null; status?: string | null }>;
  keys: ClientApiKey[];
}): ClientApiProductionStatus {
  const blockingReasons: ClientApiProductionBlockingReason[] = [];

  const companyActive = input.companyStatus === "active";
  if (!companyActive) {
    blockingReasons.push("company_inactive");
  }

  const walletActive = input.walletStatus === "active";
  if (!walletActive) {
    blockingReasons.push("wallet_inactive");
  }

  const activePlans = input.ratePlanRows.filter((r) => r.status === "active");
  const ratePlanAssigned = activePlans.length > 0;
  if (!ratePlanAssigned) {
    blockingReasons.push("missing_rate_plan");
  }

  const apiEnabled =
    ratePlanAssigned && activePlans.some((r) => r.api_enabled === true);
  if (ratePlanAssigned && !apiEnabled) {
    blockingReasons.push("api_not_enabled");
  }

  const activeKeys = input.keys.filter((k) => k.status === "active");
  const hasActiveApiKey = activeKeys.length > 0;
  if (!hasActiveApiKey) {
    blockingReasons.push("no_active_api_key");
  }

  const approvedActiveProduction = input.keys.filter(isActiveProductionKey);
  const hasProductionApprovedKey = input.keys.some(
    (k) => k.environment === "production" && k.productionApproved,
  );
  const hasProductionApprovedActiveKey = approvedActiveProduction.some(
    (k) => k.productionApproved,
  );

  if (approvedActiveProduction.length > 0 && !hasProductionApprovedActiveKey) {
    blockingReasons.push("missing_production_approval");
  } else if (
    hasActiveApiKey &&
    !hasProductionApprovedKey &&
    input.keys.some((k) => k.environment === "production")
  ) {
    blockingReasons.push("missing_production_approval");
  }

  const sendReadyKey = approvedActiveProduction.find(
    (k) => k.productionApproved && keyHasScopes(k, SEND_SCOPES),
  );
  if (hasProductionApprovedActiveKey && !sendReadyKey) {
    blockingReasons.push("insufficient_scopes");
  }

  const canUseProductionApi =
    companyActive &&
    walletActive &&
    apiEnabled &&
    hasProductionApprovedActiveKey &&
    approvedActiveProduction.some(
      (k) => k.productionApproved && keyHasScopes(k, ["balance:read"]),
    );

  const canSendApiSms =
    canUseProductionApi && Boolean(sendReadyKey);

  return {
    apiEnabled,
    hasActiveApiKey,
    hasProductionApprovedKey,
    hasProductionApprovedActiveKey,
    canUseProductionApi,
    canSendApiSms,
    blockingReasons,
    walletActive,
    companyActive,
    ratePlanAssigned,
    primaryProductionKeyId: sendReadyKey?.id ?? approvedActiveProduction[0]?.id ?? null,
    primaryProductionKeyPrefix:
      sendReadyKey?.keyPrefix ?? approvedActiveProduction[0]?.keyPrefix ?? null,
  };
}

export async function resolveClientApiProductionStatus(
  companyId: string,
): Promise<ClientApiProductionStatus> {
  const company = await findCompanyById(companyId);
  const wallet = await getOrCreateCompanyWallet(companyId);
  const ratePlans = await listActiveCompanyRatePlans(companyId, "CL");
  const listed = await listClientApiKeys(companyId);
  const keys = listed.ok ? (listed.data ?? []) : [];

  return resolveClientApiProductionStatusFromInputs({
    companyStatus: company?.status,
    walletStatus: wallet.status,
    ratePlanRows: ratePlans,
    keys,
  });
}

export function formatBlockingReason(
  reason: ClientApiProductionBlockingReason,
): string {
  return CLIENT_API_PRODUCTION_BLOCKING_LABELS[reason];
}

export function publicApiErrorCodeForBlockingReason(
  reason: ClientApiProductionBlockingReason,
): string {
  switch (reason) {
    case "api_not_enabled":
      return "API_NOT_ENABLED";
    case "missing_production_approval":
      return "PRODUCTION_NOT_APPROVED";
    case "no_active_api_key":
      return "API_KEY_INACTIVE";
    case "insufficient_scopes":
      return "INSUFFICIENT_SCOPE";
    case "wallet_inactive":
      return "WALLET_INACTIVE";
    case "company_inactive":
      return "ACCOUNT_INACTIVE";
    case "missing_rate_plan":
      return "RATE_PLAN_MISSING";
    default:
      return "API_NOT_AVAILABLE";
  }
}
