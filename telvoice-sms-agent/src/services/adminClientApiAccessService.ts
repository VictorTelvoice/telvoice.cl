import type { ClientApiKey, ClientApiKeyScope } from "../types/client-api-keys.js";
import type { ClientApiProductionStatus } from "../types/client-api-production-status.js";
import { AppError } from "../utils/errors.js";
import { insertAuditLog } from "./auditLogService.js";
import { insertAdminActionLog } from "./adminActionLogService.js";
import {
  approveProductionApiKey,
  listClientApiKeys,
  updateClientApiKeyScopes,
} from "./clientApiKeyService.js";
import { resolveClientApiProductionStatus } from "./clientApiProductionStatusService.js";
import { findCompanyById } from "./companyService.js";
import {
  listActiveCompanyRatePlans,
  updateCompanyRatePlanTraffic,
} from "./companyRatePlanService.js";
import { readCompanyBalance } from "./smsWalletService.js";

const MIN_PRODUCTION_SCOPES: ClientApiKeyScope[] = [
  "balance:read",
  "messages:read",
  "sms:send",
];

export type AdminClientApiAccessActor = {
  userId: string;
  email: string;
  role?: string | null;
};

export type AdminClientApiAccessResult = {
  success: boolean;
  company_id: string;
  api_enabled: boolean;
  has_production_key: boolean;
  can_use_production_api: boolean;
  can_send_api_sms: boolean;
  message: string;
  error?: string;
};

function mergeMinProductionScopes(scopes: ClientApiKeyScope[]): ClientApiKeyScope[] {
  const merged = new Set<ClientApiKeyScope>([...scopes, ...MIN_PRODUCTION_SCOPES]);
  return [...merged];
}

function scopesNeedUpdate(key: ClientApiKey): boolean {
  return MIN_PRODUCTION_SCOPES.some((scope) => !key.scopes.includes(scope));
}

export function buildApiAccessToggleMessage(
  enabled: boolean,
  status: Pick<
    ClientApiProductionStatus,
    "hasProductionApprovedActiveKey" | "hasActiveApiKey"
  >,
): string {
  if (!enabled) {
    return "API productiva desactivada.";
  }
  if (!status.hasProductionApprovedActiveKey) {
    return "API habilitada. Cliente debe crear o regenerar una API Key.";
  }
  return "API productiva habilitada. Si el cliente no guardó su secret, debe crear o regenerar una API Key desde Panel → API.";
}

async function ensureProductionKeysReady(
  companyId: string,
  actor: AdminClientApiAccessActor,
): Promise<void> {
  const listed = await listClientApiKeys(companyId);
  if (!listed.ok) return;

  const productionKeys = (listed.data ?? []).filter(
    (key) => key.environment === "production" && key.status !== "revoked",
  );

  for (const key of productionKeys) {
    if (key.status !== "active") continue;

    if (!key.productionApproved) {
      await approveProductionApiKey(key.id, {
        adminId: actor.userId,
        adminEmail: actor.email,
        adminName: actor.email,
      });
    }

    if (scopesNeedUpdate(key)) {
      await updateClientApiKeyScopes(key.id, companyId, mergeMinProductionScopes(key.scopes));
    }
  }
}

async function recordApiAccessAudit(input: {
  actor: AdminClientApiAccessActor;
  companyId: string;
  enabled: boolean;
  previousStatus: ClientApiProductionStatus;
  newStatus: ClientApiProductionStatus;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const action = input.enabled ? "api_enabled" : "api_disabled";
  const previous = {
    api_enabled: input.previousStatus.apiEnabled,
    can_use_production_api: input.previousStatus.canUseProductionApi,
    can_send_api_sms: input.previousStatus.canSendApiSms,
  };
  const next = {
    api_enabled: input.newStatus.apiEnabled,
    can_use_production_api: input.newStatus.canUseProductionApi,
    can_send_api_sms: input.newStatus.canSendApiSms,
  };

  await insertAdminActionLog({
    actorUserId: input.actor.userId,
    actorEmail: input.actor.email,
    companyId: input.companyId,
    actionType: action,
    previousState: previous,
    newState: next,
    metadata: { source: "admin_clients_api_switch" },
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });

  await insertAuditLog({
    actorUserId: input.actor.userId,
    actorRole: input.actor.role ?? "superadmin",
    companyId: input.companyId,
    action,
    entityType: "company",
    entityId: input.companyId,
    metadata: {
      source: "admin_clients_api_switch",
      previous_status: previous,
      new_status: next,
    },
    ipAddress: input.ipAddress ?? null,
  });
}

async function validateEnablePrerequisites(companyId: string): Promise<void> {
  const company = await findCompanyById(companyId);
  if (!company) {
    throw new AppError("Empresa no encontrada.", 404);
  }
  if (company.status !== "active") {
    throw new AppError("La empresa debe estar activa para habilitar API.", 400);
  }

  const balance = await readCompanyBalance(companyId, "CL");
  if (!balance.walletId) {
    throw new AppError("La empresa no tiene wallet SMS activa.", 400);
  }
  if (balance.status !== "active") {
    throw new AppError("Wallet inactiva. Reactiva la wallet antes de habilitar API.", 400);
  }

  const ratePlans = await listActiveCompanyRatePlans(companyId, "CL");
  if (ratePlans.length === 0 || !ratePlans.some((plan) => plan.rate_plan_id)) {
    throw new AppError("Asigne un rate plan CL antes de habilitar API.", 400);
  }
}

function canUseProductionApiAfterToggle(
  enabled: boolean,
  status: ClientApiProductionStatus,
): boolean {
  if (!enabled) return false;
  return (
    status.companyActive &&
    status.walletActive &&
    status.ratePlanAssigned &&
    status.apiEnabled &&
    !status.blockingReasons.includes("qa_demo_account")
  );
}

function toAccessResult(
  companyId: string,
  enabled: boolean,
  status: ClientApiProductionStatus,
): AdminClientApiAccessResult {
  const hasProductionKey = status.hasProductionApprovedActiveKey;
  const canUse = canUseProductionApiAfterToggle(enabled, status);
  return {
    success: true,
    company_id: companyId,
    api_enabled: enabled,
    has_production_key: hasProductionKey,
    can_use_production_api: canUse,
    can_send_api_sms: enabled ? status.canSendApiSms : false,
    message: buildApiAccessToggleMessage(enabled, status),
  };
}

export async function setAdminClientApiAccess(input: {
  companyId: string;
  enabled: boolean;
  actor: AdminClientApiAccessActor;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<AdminClientApiAccessResult> {
  const company = await findCompanyById(input.companyId);
  if (!company) {
    return {
      success: false,
      company_id: input.companyId,
      api_enabled: false,
      has_production_key: false,
      can_use_production_api: false,
      can_send_api_sms: false,
      message: "Empresa no encontrada.",
      error: "company_not_found",
    };
  }

  const previousStatus = await resolveClientApiProductionStatus(input.companyId);

  try {
    if (input.enabled) {
      await validateEnablePrerequisites(input.companyId);
      await updateCompanyRatePlanTraffic(input.companyId, { apiEnabled: true });
      await ensureProductionKeysReady(input.companyId, input.actor);
    } else {
      await updateCompanyRatePlanTraffic(input.companyId, { apiEnabled: false });
    }
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudo actualizar el acceso API.";
    return {
      success: false,
      company_id: input.companyId,
      api_enabled: previousStatus.apiEnabled,
      has_production_key: previousStatus.hasProductionApprovedActiveKey,
      can_use_production_api: previousStatus.canUseProductionApi,
      can_send_api_sms: previousStatus.canSendApiSms,
      message,
      error: "api_access_update_failed",
    };
  }

  const newStatus = await resolveClientApiProductionStatus(input.companyId);
  await recordApiAccessAudit({
    actor: input.actor,
    companyId: input.companyId,
    enabled: input.enabled,
    previousStatus,
    newStatus,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  return toAccessResult(input.companyId, input.enabled, newStatus);
}
