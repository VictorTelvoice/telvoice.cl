import type {
  DefaultRetailRatePlanConfig,
  RetailRatePlanAssignmentResult,
  RetailRatePlanAssignmentStatus,
} from "../types/default-retail-rate-plan.js";
import type { CompanyRatePlanRow } from "../types/sms-routing.js";
import type { SmsOrderRow } from "../types/wallet.js";
import { env } from "../config/env.js";
import { getSupabase } from "../database/supabaseClient.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import { listActiveCompanyRatePlans } from "./companyRatePlanService.js";
import { getSmsRatePlanById } from "./smsRatePlanService.js";
import { getOrderById } from "./smsOrderService.js";
import { normalizeClientMaxTps } from "./smsTrafficPolicyService.js";
import { insertAuditLog } from "./auditLogService.js";

const DEFAULT_TRAFFIC_TYPES = ["transactional", "promotional"] as const;

export function getDefaultRetailRatePlanConfig(): DefaultRetailRatePlanConfig {
  return env.defaultRetailRatePlan;
}

export async function getDefaultRetailRatePlan(): Promise<{
  config: DefaultRetailRatePlanConfig;
  ratePlan: Awaited<ReturnType<typeof getSmsRatePlanById>>;
}> {
  const config = getDefaultRetailRatePlanConfig();
  let ratePlan = await getSmsRatePlanById(config.ratePlanId);

  if (!ratePlan && config.ratePlanCode) {
    const { data, error } = await getSupabase()
      .from("sms_rate_plans")
      .select("*")
      .eq("code", config.ratePlanCode)
      .eq("status", "active")
      .maybeSingle();
    if (error) {
      wrapSupabaseError(error, "getDefaultRetailRatePlan.byCode");
    }
    ratePlan = data as typeof ratePlan;
  }

  return { config, ratePlan };
}

export async function hasActiveRetailRatePlan(
  companyId: string,
  country?: string,
): Promise<boolean> {
  const cfg = getDefaultRetailRatePlanConfig();
  const c = (country ?? cfg.country).trim().toUpperCase();
  const plans = await listActiveCompanyRatePlans(companyId, c);
  return plans.some((p) => p.traffic_type === "transactional");
}

async function hasActiveRatePlanForTraffic(
  companyId: string,
  ratePlanId: string,
  trafficType: string,
  country: string,
): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("company_rate_plans")
    .select("id")
    .eq("company_id", companyId)
    .eq("rate_plan_id", ratePlanId)
    .eq("country", country)
    .eq("traffic_type", trafficType.trim().toLowerCase())
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    wrapSupabaseError(error, "hasActiveRatePlanForTraffic");
  }
  return Boolean(data);
}

async function assignTrafficTypesToCompany(input: {
  companyId: string;
  ratePlanId: string;
  config: DefaultRetailRatePlanConfig;
}): Promise<string[]> {
  const country = input.config.country.trim().toUpperCase();
  const trafficTypes =
    input.config.trafficTypes?.length > 0
      ? [...new Set(input.config.trafficTypes.map((t) => t.trim().toLowerCase()))]
      : [...DEFAULT_TRAFFIC_TYPES];

  const maxTps = normalizeClientMaxTps(input.config.maxTps);
  const createdIds: string[] = [];

  for (const trafficType of trafficTypes) {
    if (
      await hasActiveRatePlanForTraffic(
        input.companyId,
        input.ratePlanId,
        trafficType,
        country,
      )
    ) {
      continue;
    }

    await getSupabase()
      .from("company_rate_plans")
      .update({ status: "inactive" })
      .eq("company_id", input.companyId)
      .eq("country", country)
      .eq("traffic_type", trafficType);

    const { data, error } = await getSupabase()
      .from("company_rate_plans")
      .insert({
        company_id: input.companyId,
        rate_plan_id: input.ratePlanId,
        country,
        traffic_type: trafficType,
        status: "active",
        max_tps: maxTps,
        daily_limit: null,
        monthly_limit: null,
        live_enabled: input.config.liveEnabled,
        campaigns_enabled: input.config.campaignsEnabled,
        api_enabled: input.config.apiEnabled,
        metadata: {
          assignment_source: "default_retail_auto",
        },
      })
      .select("id")
      .single();

    if (error) {
      wrapSupabaseError(error, "assignTrafficTypesToCompany");
    }
    createdIds.push((data as CompanyRatePlanRow).id);
  }

  return createdIds;
}

/**
 * Alinea flags operativos en filas TELVOICE CL Retail existentes (upgrade only).
 * No hace downgrade de max_tps ni desactiva live/campaigns.
 */
export async function ensureRetailOperationalFlagsForCompany(
  companyId: string,
  options?: { ratePlanId?: string },
): Promise<{ updatedIds: string[] }> {
  const config = getDefaultRetailRatePlanConfig();
  const { ratePlan } = await getDefaultRetailRatePlan();
  const targetPlanId = options?.ratePlanId ?? ratePlan?.id ?? config.ratePlanId;
  const country = config.country.trim().toUpperCase();
  const targetTps = normalizeClientMaxTps(config.maxTps);
  const plans = await listActiveCompanyRatePlans(companyId, country);
  const updatedIds: string[] = [];

  for (const plan of plans) {
    if (plan.rate_plan_id !== targetPlanId) {
      continue;
    }

    const patch: Record<string, unknown> = {};
    if (!plan.live_enabled) {
      patch.live_enabled = true;
    }
    if (!plan.campaigns_enabled) {
      patch.campaigns_enabled = true;
    }
    if (plan.api_enabled) {
      patch.api_enabled = false;
    }
    const currentTps = Number(plan.max_tps ?? 1);
    if (currentTps < targetTps) {
      patch.max_tps = targetTps;
    }

    if (Object.keys(patch).length === 0) {
      continue;
    }

    const { error } = await getSupabase()
      .from("company_rate_plans")
      .update(patch)
      .eq("id", plan.id);

    if (error) {
      wrapSupabaseError(error, "ensureRetailOperationalFlagsForCompany");
    }
    updatedIds.push(plan.id);
  }

  return { updatedIds };
}

export async function assignDefaultRetailRatePlanToCompany(
  companyId: string,
  options?: {
    source?: string;
    actorUserId?: string | null;
    orderId?: string | null;
  },
): Promise<RetailRatePlanAssignmentResult> {
  const at = new Date().toISOString();
  const source = options?.source ?? "default_retail_auto";

  if (await hasActiveRetailRatePlan(companyId)) {
    const { ratePlan } = await getDefaultRetailRatePlan();
    const upgraded = await ensureRetailOperationalFlagsForCompany(companyId, {
      ratePlanId: ratePlan?.id,
    });
    const result: RetailRatePlanAssignmentResult = {
      status:
        upgraded.updatedIds.length > 0
          ? "upgraded_existing_rate_plan"
          : "skipped_already_has_active_rate_plan",
      at,
      source,
      skipped: upgraded.updatedIds.length === 0,
      reason:
        upgraded.updatedIds.length > 0
          ? "retail_flags_upgraded"
          : "already_has_active_rate_plan",
      rate_plan_id: ratePlan?.id,
      company_rate_plan_ids: upgraded.updatedIds,
    };
    if (options?.orderId) {
      await patchOrderRatePlanMetadata(options.orderId, result);
    }
    return result;
  }

  const { config, ratePlan } = await getDefaultRetailRatePlan();
  if (!ratePlan?.id) {
    const result: RetailRatePlanAssignmentResult = {
      status: "failed",
      at,
      source,
      error: "Rate plan retail default no encontrado en catálogo.",
    };
    if (options?.orderId) {
      await patchOrderRatePlanMetadata(options.orderId, result);
    }
    console.error("[default-retail-rate-plan] rate plan not found", config);
    return result;
  }

  try {
    const createdIds = await assignTrafficTypesToCompany({
      companyId,
      ratePlanId: ratePlan.id,
      config,
    });

    const upgraded = await ensureRetailOperationalFlagsForCompany(companyId, {
      ratePlanId: ratePlan.id,
    });

    const status: RetailRatePlanAssignmentStatus =
      createdIds.length > 0
        ? "assigned"
        : upgraded.updatedIds.length > 0
          ? "upgraded_existing_rate_plan"
          : "already_assigned";

    const result: RetailRatePlanAssignmentResult = {
      status,
      at,
      source,
      rate_plan_id: ratePlan.id,
      rate_plan_code: ratePlan.code ?? config.ratePlanCode,
      rate_plan_name: ratePlan.name ?? "TELVOICE CL Retail",
      company_rate_plan_ids: createdIds,
    };

    if (options?.orderId) {
      await patchOrderRatePlanMetadata(options.orderId, result);
    }

    await insertAuditLog({
      actorUserId: options?.actorUserId ?? null,
      companyId,
      action: "rate_plan.assign_default_retail",
      entityType: options?.orderId ? "sms_order" : "company",
      entityId: options?.orderId ?? companyId,
      metadata: result,
    });

    if (createdIds.length > 0) {
      console.info("[default-retail-rate-plan] assigned", {
        companyId,
        ratePlanId: ratePlan.id,
        source,
        createdIds,
      });
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const result: RetailRatePlanAssignmentResult = {
      status: "failed",
      at,
      source,
      rate_plan_id: ratePlan.id,
      error: message,
    };
    if (options?.orderId) {
      await patchOrderRatePlanMetadata(options.orderId, result);
    }
    console.error("[default-retail-rate-plan] assign failed", companyId, message);
    return result;
  }
}

async function patchOrderRatePlanMetadata(
  orderId: string,
  assignment: RetailRatePlanAssignmentResult,
): Promise<void> {
  const order = await getOrderById(orderId);
  if (!order) {
    return;
  }
  const meta = { ...(order.metadata ?? {}) };
  meta.rate_plan_assignment = assignment;
  meta.rate_plan_assignment_status = assignment.status;
  meta.rate_plan_assignment_source = assignment.source ?? null;
  meta.rate_plan_id = assignment.rate_plan_id ?? null;
  if (assignment.error) {
    meta.rate_plan_assignment_error = assignment.error;
  }

  const { error } = await getSupabase()
    .from("sms_orders")
    .update({ metadata: meta })
    .eq("id", orderId);

  if (error) {
    wrapSupabaseError(error, "patchOrderRatePlanMetadata");
  }
}

/** Best-effort tras crédito/claim; no lanza; no revierte wallet. */
export async function ensureDefaultRetailRatePlanForCompany(
  companyId: string,
  options?: {
    source?: string;
    orderId?: string | null;
    userId?: string | null;
    actorUserId?: string | null;
  },
): Promise<RetailRatePlanAssignmentResult | null> {
  try {
    if (options?.orderId) {
      const order = await getOrderById(options.orderId);
      if (order?.metadata?.rate_plan_assignment_status === "assigned") {
        return order.metadata.rate_plan_assignment as RetailRatePlanAssignmentResult;
      }
      if (
        order?.metadata?.rate_plan_assignment_status ===
        "skipped_already_has_active_rate_plan"
      ) {
        return order.metadata.rate_plan_assignment as RetailRatePlanAssignmentResult;
      }
    }

    return await assignDefaultRetailRatePlanToCompany(companyId, {
      source: options?.source,
      orderId: options?.orderId,
      actorUserId: options?.actorUserId ?? options?.userId,
    });
  } catch (err) {
    console.error(
      "[default-retail-rate-plan] ensure failed",
      companyId,
      options?.orderId,
      err,
    );
    return null;
  }
}

export function formatRatePlanAssignmentForAdmin(
  order: Pick<SmsOrderRow, "metadata" | "credit_status" | "company_id">,
): {
  status: string;
  detail: string;
  alert: boolean;
} {
  const assignment = order.metadata?.rate_plan_assignment as
    | RetailRatePlanAssignmentResult
    | undefined;
  const status =
    assignment?.status ??
    (typeof order.metadata?.rate_plan_assignment_status === "string"
      ? order.metadata.rate_plan_assignment_status
      : "—");

  if (order.credit_status === "credited" && order.company_id && status === "—") {
    return {
      status: "pendiente_verificación",
      detail:
        "Orden acreditada sin registro de asignación de rate plan. Revisar company_rate_plans.",
      alert: true,
    };
  }

  const alertStatuses = new Set([
    "failed",
    "pendiente_verificación",
  ]);

  const parts: string[] = [];
  if (assignment?.rate_plan_name || assignment?.rate_plan_code) {
    parts.push(
      `Plan: ${assignment.rate_plan_name ?? assignment.rate_plan_code}`,
    );
  } else if (assignment?.rate_plan_id) {
    parts.push(`Plan ID: ${assignment.rate_plan_id}`);
  }
  if (assignment?.source) {
    parts.push(`Origen: ${assignment.source}`);
  }
  if (assignment?.reason) {
    parts.push(assignment.reason);
  }
  if (assignment?.error || order.metadata?.rate_plan_assignment_error) {
    parts.push(
      String(assignment?.error ?? order.metadata?.rate_plan_assignment_error),
    );
  }

  return {
    status,
    detail: parts.length ? parts.join(" · ") : "—",
    alert: alertStatuses.has(status),
  };
}
