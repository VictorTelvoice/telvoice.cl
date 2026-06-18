import { getSupabase } from "../database/supabaseClient.js";
import { insertAuditLog } from "./auditLogService.js";
import { env } from "../config/env.js";
import { createAdminClientNumber } from "./adminClientNumberService.js";
import type {
  PublicRealNumberAvailability,
  PublicInventoryEligibility,
  PublicInventoryFilterCategory,
  PublicStockSummary,
  InventoryPublicDashboardRow,
  PendingInventoryHold,
  RealNumberConnectionStatus,
  RealNumberInventoryRow,
  RealNumberInventorySummary,
  RealNumberSalesStatus,
} from "../types/real-number-inventory.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";
import {
  inventoryPublicId,
  resolveInventoryIdFromPublicId,
} from "../utils/inventory-public-id.js";

const RESERVATION_MINUTES = 30;

export const SIM_CHECKOUT_HOLD_TTL_MINUTES = RESERVATION_MINUTES;
export const PUBLIC_SIM_NUMBER_LIST_LIMIT = 3;

export { RESERVATION_MINUTES };

function simHoldRemainingMinutes(
  createdAt: string,
  reservationExpired: boolean,
  reservedUntil?: string | null,
): number | null {
  if (reservationExpired) return null;
  const now = Date.now();
  const expiryMs =
    reservedUntil != null
      ? new Date(reservedUntil).getTime()
      : new Date(createdAt).getTime() + SIM_CHECKOUT_HOLD_TTL_MINUTES * 60 * 1000;
  if (expiryMs <= now) return null;
  return Math.max(1, Math.ceil((expiryMs - now) / 60_000));
}

function isSimCheckoutHoldExpired(
  createdAt: string,
  reservedUntil?: string | null,
): boolean {
  const now = Date.now();
  if (reservedUntil != null) {
    return new Date(reservedUntil).getTime() < now;
  }
  return now - new Date(createdAt).getTime() > SIM_CHECKOUT_HOLD_TTL_MINUTES * 60 * 1000;
}

function orderShortCode(orderId: string, publicRef?: string | null): string {
  if (publicRef && String(publicRef).trim()) return String(publicRef).trim();
  return orderId.slice(0, 8).toUpperCase();
}

function formatAgeHours(ageHours: number): string {
  if (ageHours < 1) return `${Math.max(1, Math.round(ageHours * 60))} min`;
  if (ageHours < 48) return `${ageHours.toFixed(1)} h`;
  return `${(ageHours / 24).toFixed(1)} d`;
}

export type RealNumberInventoryModuleState = {
  available: boolean;
  migrationPending: boolean;
};

function mapRow(row: Record<string, unknown>): RealNumberInventoryRow {
  return {
    id: String(row.id),
    e164_number: String(row.e164_number),
    country_code: String(row.country_code ?? "CL"),
    provider: String(row.provider ?? "telsim"),
    webhook_connected: Boolean(row.webhook_connected),
    connection_status: row.connection_status as RealNumberConnectionStatus,
    sales_status: row.sales_status as RealNumberSalesStatus,
    current_order_id:
      row.current_order_id != null ? String(row.current_order_id) : null,
    current_company_id:
      row.current_company_id != null ? String(row.current_company_id) : null,
    current_client_number_id:
      row.current_client_number_id != null
        ? String(row.current_client_number_id)
        : null,
    current_agent_request_id:
      row.current_agent_request_id != null
        ? String(row.current_agent_request_id)
        : null,
    reserved_until:
      row.reserved_until != null ? String(row.reserved_until) : null,
    gateway_id: row.gateway_id != null ? String(row.gateway_id) : null,
    sim_slot: row.sim_slot != null ? String(row.sim_slot) : null,
    webhook_url: row.webhook_url != null ? String(row.webhook_url) : null,
    metadata:
      row.metadata != null && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function getRealNumberInventoryModuleState(): Promise<RealNumberInventoryModuleState> {
  const sb = getSupabase();
  const { error } = await sb.from("real_number_inventory").select("id").limit(1);
  if (error) {
    if (isMissingTableError(error)) {
      return { available: false, migrationPending: true };
    }
    throw wrapSupabaseError(error, "real_number_inventory");
  }
  return { available: true, migrationPending: false };
}

export async function listInventory(
  filters: {
    sales_status?: RealNumberSalesStatus | "";
    connection_status?: RealNumberConnectionStatus | "";
    q?: string;
  } = {},
  limit = 200,
): Promise<RealNumberInventoryRow[]> {
  const sb = getSupabase();
  let query = sb
    .from("real_number_inventory")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (filters.sales_status) {
    query = query.eq("sales_status", filters.sales_status);
  }
  if (filters.connection_status) {
    query = query.eq("connection_status", filters.connection_status);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) return [];
    throw wrapSupabaseError(error, "listInventory");
  }

  let rows = (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
  if (filters.q) {
    const q = filters.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.e164_number.toLowerCase().includes(q) ||
        (r.gateway_id ?? "").toLowerCase().includes(q) ||
        (r.sim_slot ?? "").toLowerCase().includes(q),
    );
  }
  return rows;
}

export async function getInventoryById(
  id: string,
): Promise<RealNumberInventoryRow | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("real_number_inventory")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return null;
    throw wrapSupabaseError(error, "getInventoryById");
  }
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function getInventoryByOrderId(
  orderId: string,
): Promise<RealNumberInventoryRow | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("real_number_inventory")
    .select("*")
    .eq("current_order_id", orderId)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return null;
    throw wrapSupabaseError(error, "getInventoryByOrderId");
  }
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function getInventorySummary(): Promise<RealNumberInventorySummary> {
  const sb = getSupabase();
  const { data, error } = await sb.from("real_number_inventory").select("sales_status");
  if (error) {
    if (isMissingTableError(error)) {
      return {
        total: 0,
        connected_available: 0,
        preconfigured_pending: 0,
        reserved: 0,
        sold_pending_activation: 0,
        active_assigned: 0,
        not_for_sale: 0,
        suspended: 0,
      };
    }
    throw wrapSupabaseError(error, "getInventorySummary");
  }

  const counts = {
    total: data?.length ?? 0,
    connected_available: 0,
    preconfigured_pending: 0,
    reserved: 0,
    sold_pending_activation: 0,
    active_assigned: 0,
    not_for_sale: 0,
    suspended: 0,
  };

  for (const row of data ?? []) {
    const status = String((row as { sales_status?: string }).sales_status);
    if (status === "connected_available") counts.connected_available += 1;
    if (status === "preconfigured_pending") counts.preconfigured_pending += 1;
    if (status === "reserved_pending_payment") counts.reserved += 1;
    if (status === "sold_pending_activation") counts.sold_pending_activation += 1;
    if (status === "active_assigned") counts.active_assigned += 1;
    if (status === "not_for_sale") counts.not_for_sale += 1;
    if (status === "suspended") counts.suspended += 1;
  }

  return counts;
}

/** Alias semántico para dashboard admin. */
export async function getInventoryStats(): Promise<RealNumberInventorySummary> {
  return getInventorySummary();
}

export function maskE164(number: string): string {
  const trimmed = number.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 4) return "+** *** ***";
  const last3 = digits.slice(-3);
  if (digits.startsWith("56") && digits.length >= 11) {
    return `+56 *** *** ${last3}`;
  }
  const cc = digits.length > 10 ? digits.slice(0, 2) : "";
  return cc ? `+${cc} *** *** ${last3}` : `*** *** ${last3}`;
}

/** Formato móvil Chile para UI pública (+56 9 *** *** XXX). */
export function maskE164ChileMobile(number: string): string {
  const digits = number.replace(/\D/g, "");
  const last3 = digits.slice(-3);
  if (digits.startsWith("569") && digits.length >= 11) {
    return `+56 9 *** *** ${last3}`;
  }
  return maskE164(number);
}

export type PublicAvailableNumberItem = {
  inventory_public_id: string;
  display_number: string;
  suffix: string;
  plan_eligible: string[];
};

const PUBLIC_PLAN_ELIGIBLE = ["sim_starter", "sim_pro"] as const;

/** Inventario retenido por órdenes SIM bundle pendientes — no vendible públicamente. */
export async function getPendingSimBundleHeldInventoryIds(): Promise<Set<string>> {
  const details = await getPendingSimBundleHeldInventoryDetails({
    includeExpired: false,
  });
  return new Set(details.keys());
}

/** Detalle de retención por checkout SIM pending (metadata.inventory_number_id). */
export async function getPendingSimBundleHeldInventoryDetails(options?: {
  /** Si false, omite holds expirados (solo bloquean checkout público los vigentes). */
  includeExpired?: boolean;
}): Promise<Map<string, PendingInventoryHold>> {
  const includeExpired = options?.includeExpired !== false;
  const sb = getSupabase();
  const held = new Map<string, PendingInventoryHold>();
  const now = Date.now();
  const ttlMs = SIM_CHECKOUT_HOLD_TTL_MINUTES * 60 * 1000;

  const { data: reservedRows, error: reservedError } = await sb
    .from("real_number_inventory")
    .select("id, current_order_id, reserved_until, updated_at")
    .eq("sales_status", "reserved_pending_payment");

  if (reservedError) {
    if (isMissingTableError(reservedError)) return held;
    throw wrapSupabaseError(reservedError, "getPendingSimBundleHeldInventoryDetails");
  }

  const reservedOrderIds = [
    ...new Set(
      (reservedRows ?? [])
        .map((row) =>
          row.current_order_id != null ? String(row.current_order_id) : null,
        )
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const reservedOrderById = new Map<
    string,
    { checkout_email: string | null; created_at: string; metadata: unknown }
  >();
  if (reservedOrderIds.length > 0) {
    const { data: reservedOrders, error: reservedOrdersError } = await sb
      .from("sms_orders")
      .select("id, checkout_email, created_at, metadata")
      .in("id", reservedOrderIds);
    if (reservedOrdersError) {
      throw wrapSupabaseError(
        reservedOrdersError,
        "getPendingSimBundleHeldInventoryDetails",
      );
    }
    for (const order of reservedOrders ?? []) {
      reservedOrderById.set(String(order.id), order);
    }
  }

  for (const row of reservedRows ?? []) {
    const inventoryId = String(row.id);
    const orderId =
      row.current_order_id != null ? String(row.current_order_id) : null;
    if (!orderId) continue;

    const order = reservedOrderById.get(orderId);
    const createdAt = String(order?.created_at ?? row.updated_at ?? new Date().toISOString());
    const reservedUntil =
      row.reserved_until != null ? String(row.reserved_until) : null;
    const reservationExpired = isSimCheckoutHoldExpired(createdAt, reservedUntil);
    if (!includeExpired && reservationExpired) continue;

    const meta =
      order?.metadata && typeof order.metadata === "object"
        ? (order.metadata as Record<string, unknown>)
        : {};
    const publicRef =
      typeof meta.public_checkout_reference === "string"
        ? meta.public_checkout_reference
        : null;
    const planId =
      typeof meta.plan_id === "string" ? meta.plan_id : null;
    const ageHours = (now - new Date(createdAt).getTime()) / (3600 * 1000);

    held.set(inventoryId, {
      orderId,
      orderCode: orderShortCode(orderId, publicRef),
      email:
        typeof order?.checkout_email === "string"
          ? order.checkout_email
          : null,
      planId,
      createdAt,
      ageHours,
      reservationExpired,
      remainingMinutes: simHoldRemainingMinutes(
        createdAt,
        reservationExpired,
        reservedUntil,
      ),
    });
  }

  const { data: pendingOrders, error: ordersError } = await sb
    .from("sms_orders")
    .select("id, checkout_email, created_at, metadata")
    .eq("payment_status", "pending");

  if (ordersError) {
    throw wrapSupabaseError(ordersError, "getPendingSimBundleHeldInventoryDetails");
  }

  for (const order of pendingOrders ?? []) {
    const meta =
      order.metadata && typeof order.metadata === "object"
        ? (order.metadata as Record<string, unknown>)
        : {};
    if (
      meta.product_type !== "sim_agent_bundle" &&
      meta.product_type !== "sim_subscription"
    ) {
      continue;
    }
    if (meta.inventory_hold_released_at || meta.reservation_released_at) {
      continue;
    }
    const inventoryId = meta.inventory_number_id;
    if (typeof inventoryId !== "string" || !inventoryId.trim()) continue;

    const orderId = String(order.id);
    const createdAt = String(order.created_at ?? new Date().toISOString());
    const ageHours = (now - new Date(createdAt).getTime()) / (3600 * 1000);
    const reservationExpired = now - new Date(createdAt).getTime() > ttlMs;
    if (!includeExpired && reservationExpired) continue;

    const publicRef =
      typeof meta.public_checkout_reference === "string"
        ? meta.public_checkout_reference
        : null;
    const planId =
      typeof meta.plan_id === "string" ? meta.plan_id : null;

    held.set(inventoryId.trim(), {
      orderId,
      orderCode: orderShortCode(orderId, publicRef),
      email:
        typeof order.checkout_email === "string"
          ? order.checkout_email
          : null,
      planId,
      createdAt,
      ageHours,
      reservationExpired,
      remainingMinutes: simHoldRemainingMinutes(
        createdAt,
        reservationExpired,
        null,
      ),
    });
  }

  return held;
}

function qaExclusionReason(metadata: unknown): string | null {
  if (inventoryMetadataQaOnly(metadata)) return "metadata.qa_only";
  if (inventoryMetadataIsQaOrTest(metadata)) return "metadata QA/test";
  return null;
}

/** Diagnóstico compartido entre checkout público y admin numeraciones. */
export function getPublicInventoryEligibility(
  row: RealNumberInventoryRow,
  ctx: {
    heldByOrder?: PendingInventoryHold | null;
    companyName?: string | null;
  } = {},
): PublicInventoryEligibility {
  const heldByOrder = ctx.heldByOrder ?? null;
  const qaReason = qaExclusionReason(row.metadata);
  const noSaleActions = {
    canMarkConnected: false,
    canBulkMarkConnected: false,
    canReleaseExpiredHold: false,
    canMarkNotForSale: false,
    canAssign: false,
  };

  if (row.sales_status === "active_assigned" || row.current_company_id) {
    const companyLabel = ctx.companyName?.trim() || "cliente";
    return {
      eligible: false,
      code: "active_assigned",
      label: "Asignado a cliente",
      reason: `Asignado a ${companyLabel}`,
      filterCategory: "assigned",
      ...noSaleActions,
    };
  }

  if (row.sales_status === "sold_pending_activation") {
    const orderCode = row.current_order_id
      ? orderShortCode(row.current_order_id)
      : "—";
    return {
      eligible: false,
      code: "sold_pending_activation",
      label: "Vendido pendiente activación",
      reason: `Orden ${orderCode}`,
      filterCategory: "sold",
      heldOrder: row.current_order_id
        ? {
            orderId: row.current_order_id,
            orderCode,
            email: null,
            planId: null,
            createdAt: row.updated_at,
            ageHours: 0,
            reservationExpired: false,
            remainingMinutes: null,
          }
        : undefined,
      ...noSaleActions,
    };
  }

  if (row.sales_status === "suspended") {
    return {
      eligible: false,
      code: "suspended",
      label: "Suspendido",
      reason: "Numeración suspendida",
      filterCategory: "qa_not_sellable",
      ...noSaleActions,
    };
  }

  if (row.sales_status === "not_for_sale") {
    return {
      eligible: false,
      code: "not_sellable",
      label: "No vendible",
      reason: "Marcado como no vendible en admin",
      filterCategory: "qa_not_sellable",
      ...noSaleActions,
    };
  }

  if (row.sales_status === "reserved_pending_payment") {
    const expired = isSimCheckoutHoldExpired(
      heldByOrder?.createdAt ?? row.updated_at,
      row.reserved_until,
    );
    const orderCode = row.current_order_id
      ? orderShortCode(row.current_order_id)
      : "—";
    const hold: PendingInventoryHold | undefined = row.current_order_id
      ? {
          orderId: row.current_order_id,
          orderCode,
          email: heldByOrder?.email ?? null,
          planId: heldByOrder?.planId ?? null,
          createdAt: heldByOrder?.createdAt ?? row.updated_at,
          ageHours: heldByOrder?.ageHours ?? 0,
          reservationExpired: expired,
          remainingMinutes: simHoldRemainingMinutes(
            heldByOrder?.createdAt ?? row.updated_at,
            expired,
            row.reserved_until,
          ),
        }
      : undefined;
    return {
      eligible: false,
      code: "reserved",
      label: expired ? "Reserva expirada" : "Reservado (checkout)",
      reason: expired
        ? `Reserva expirada · orden ${orderCode}`
        : `Reservado por checkout · orden ${orderCode}`,
      filterCategory: "held_by_checkout",
      heldOrder: hold,
      canMarkConnected: false,
      canBulkMarkConnected: false,
      canReleaseExpiredHold: expired,
      canMarkNotForSale: false,
      canAssign: false,
    };
  }

  if (qaReason) {
    return {
      eligible: false,
      code: "qa_only",
      label: "QA / no público",
      reason: qaReason,
      filterCategory: "qa_not_sellable",
      canMarkConnected: false,
      canBulkMarkConnected: false,
      canReleaseExpiredHold: false,
      canMarkNotForSale: false,
      canAssign: false,
    };
  }

  if (heldByOrder) {
    return {
      eligible: false,
      code: "held_by_pending_order",
      label: "Retenido por checkout pendiente",
      reason: `Orden ${heldByOrder.orderCode} hace ${formatAgeHours(heldByOrder.ageHours)}${heldByOrder.email ? ` · ${heldByOrder.email}` : ""}`,
      filterCategory: "held_by_checkout",
      heldOrder: heldByOrder,
      canMarkConnected: false,
      canBulkMarkConnected: false,
      canReleaseExpiredHold: heldByOrder.reservationExpired,
      canMarkNotForSale: false,
      canAssign: false,
    };
  }

  const pendingConnection =
    row.sales_status === "preconfigured_pending" ||
    row.sales_status === "released" ||
    row.connection_status !== "connected" ||
    !row.webhook_connected;

  if (pendingConnection) {
    const reasons: string[] = [];
    if (
      row.sales_status === "preconfigured_pending" ||
      row.sales_status === "released"
    ) {
      reasons.push("Falta marcar conectado");
    }
    if (!row.webhook_connected) reasons.push("Webhook no conectado");
    if (row.connection_status !== "connected") {
      reasons.push(`Conexión: ${realNumberConnectionStatusLabel(row.connection_status)}`);
    }
    const canMark =
      row.sales_status === "preconfigured_pending" ||
      row.sales_status === "released";
    return {
      eligible: false,
      code:
        row.sales_status === "preconfigured_pending" ||
        row.sales_status === "released"
          ? "pending_connection"
          : "webhook_missing",
      label: "Pendiente conexión",
      reason: reasons.join(" · "),
      filterCategory: "pending_connection",
      canMarkConnected: canMark,
      canBulkMarkConnected: row.sales_status === "preconfigured_pending",
      canReleaseExpiredHold: false,
      canMarkNotForSale: true,
      canAssign: true,
    };
  }

  if (row.sales_status === "connected_available") {
    return {
      eligible: true,
      code: "public_sellable",
      label: "Vendible en landing",
      reason: "Listo para checkout público",
      filterCategory: "public_sellable",
      canMarkConnected: false,
      canBulkMarkConnected: false,
      canReleaseExpiredHold: false,
      canMarkNotForSale: true,
      canAssign: true,
    };
  }

  return {
    eligible: false,
    code: "not_sellable",
    label: "No vendible",
    reason: `Estado comercial: ${realNumberSalesStatusLabel(row.sales_status)}`,
    filterCategory: "qa_not_sellable",
    canMarkConnected: false,
    canBulkMarkConnected: false,
    canReleaseExpiredHold: false,
    canMarkNotForSale: false,
    canAssign: false,
  };
}

export function summarizePublicStock(
  rows: InventoryPublicDashboardRow[],
): PublicStockSummary {
  const summary: PublicStockSummary = {
    publicSellable: 0,
    pendingConnection: 0,
    heldByCheckoutActive: 0,
    heldByCheckoutExpired: 0,
    soldPendingActivation: 0,
    activeAssigned: 0,
    qaNotSellable: 0,
  };

  for (const { eligibility } of rows) {
    switch (eligibility.filterCategory) {
      case "public_sellable":
        summary.publicSellable += 1;
        break;
      case "pending_connection":
        summary.pendingConnection += 1;
        break;
      case "held_by_checkout":
        if (
          eligibility.heldOrder?.reservationExpired ||
          eligibility.canReleaseExpiredHold
        ) {
          summary.heldByCheckoutExpired += 1;
        } else {
          summary.heldByCheckoutActive += 1;
        }
        break;
      case "sold":
        summary.soldPendingActivation += 1;
        break;
      case "assigned":
        summary.activeAssigned += 1;
        break;
      case "qa_not_sellable":
        summary.qaNotSellable += 1;
        break;
      default:
        break;
    }
  }

  return summary;
}

export async function buildInventoryPublicDashboard(
  inventory: RealNumberInventoryRow[],
  companyNames: Map<string, string>,
): Promise<{
  summary: PublicStockSummary;
  rows: InventoryPublicDashboardRow[];
}> {
  const heldDetails = await getPendingSimBundleHeldInventoryDetails();
  const rows = inventory.map((row) => ({
    row,
    eligibility: getPublicInventoryEligibility(row, {
      heldByOrder: heldDetails.get(row.id) ?? null,
      companyName: row.current_company_id
        ? companyNames.get(row.current_company_id) ?? null
        : null,
    }),
  }));
  return {
    summary: summarizePublicStock(rows),
    rows,
  };
}

export function filterInventoryDashboardRows(
  rows: InventoryPublicDashboardRow[],
  filter: PublicInventoryFilterCategory,
): InventoryPublicDashboardRow[] {
  if (filter === "all") return rows;
  return rows.filter((item) => item.eligibility.filterCategory === filter);
}

function isInventoryPubliclySellable(
  row: {
    id: string;
    sales_status?: string;
    connection_status?: string;
    webhook_connected?: boolean;
    metadata?: Record<string, unknown> | null;
    current_company_id?: string | null;
    current_order_id?: string | null;
    reserved_until?: string | null;
    updated_at?: string;
  },
  heldIds?: Set<string>,
): boolean {
  if (heldIds?.has(row.id)) return false;
  const eligibility = getPublicInventoryEligibility(
    row as RealNumberInventoryRow,
    { heldByOrder: null },
  );
  return eligibility.eligible;
}

function inventoryMetadataRecord(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object") return null;
  return metadata as Record<string, unknown>;
}

function inventoryMetadataQaOnly(metadata: unknown): boolean {
  const meta = inventoryMetadataRecord(metadata);
  if (!meta) return false;
  const qa = meta.qa_only;
  return qa === true || qa === "true";
}

/** Inventario marcado QA/test — nunca vendible en producción pública. */
function inventoryMetadataIsQaOrTest(metadata: unknown): boolean {
  const meta = inventoryMetadataRecord(metadata);
  if (!meta) return false;
  if (inventoryMetadataQaOnly(metadata)) return true;
  const purpose = String(meta.purpose ?? "").trim().toLowerCase();
  if (purpose === "sim_subscription_sandbox_e2e") return true;
  if (purpose === "qa" || purpose === "test" || purpose === "sandbox") return true;
  const envTag = String(meta.environment ?? meta.env ?? "").trim().toLowerCase();
  if (envTag === "qa" || envTag === "test" || envTag === "sandbox") return true;
  return meta.non_production === true || meta.non_production === "true";
}

/** Producción: excluye QA/test. agent-qa: solo qa_only. */
export function passesPublicInventoryListingFilter(metadata: unknown): boolean {
  const qaOnly = inventoryMetadataQaOnly(metadata);
  const qaOrTest = inventoryMetadataIsQaOrTest(metadata);
  if (env.simQaE2e.inventoryQaOnlyListing) return qaOnly;
  return !qaOrTest;
}

/** Restaura reserva si una orden pending perdió el hold por expiración automática. */
export async function ensureSimInventoryHeldForPendingOrder(input: {
  orderId: string;
  inventoryId: string;
}): Promise<{
  held: boolean;
  expiresAt: string | null;
  salesStatus: RealNumberSalesStatus | null;
}> {
  const sb = getSupabase();
  const row = await getInventoryById(input.inventoryId);
  if (!row) {
    return { held: false, expiresAt: null, salesStatus: null };
  }

  const now = Date.now();
  if (
    row.sales_status === "reserved_pending_payment" &&
    row.current_order_id === input.orderId &&
    row.reserved_until &&
    new Date(row.reserved_until).getTime() > now
  ) {
    return {
      held: true,
      expiresAt: row.reserved_until,
      salesStatus: row.sales_status,
    };
  }

  if (
    row.sales_status === "connected_available" &&
    !row.current_order_id &&
    row.connection_status === "connected" &&
    row.webhook_connected
  ) {
    const reservedUntil = new Date(now + RESERVATION_MINUTES * 60 * 1000);
    const { data, error } = await sb
      .from("real_number_inventory")
      .update({
        sales_status: "reserved_pending_payment",
        current_order_id: input.orderId,
        reserved_until: reservedUntil.toISOString(),
      })
      .eq("id", input.inventoryId)
      .eq("sales_status", "connected_available")
      .is("current_order_id", null)
      .eq("connection_status", "connected")
      .eq("webhook_connected", true)
      .select("sales_status, reserved_until")
      .maybeSingle();

    if (error) {
      throw wrapSupabaseError(error, "ensureSimInventoryHeldForPendingOrder");
    }

    if (data) {
      return {
        held: true,
        expiresAt: String(data.reserved_until),
        salesStatus: data.sales_status as RealNumberSalesStatus,
      };
    }
  }

  return {
    held:
      row.sales_status === "reserved_pending_payment" &&
      row.current_order_id === input.orderId,
    expiresAt: row.reserved_until,
    salesStatus: row.sales_status,
  };
}

export async function listPublicAvailableNumbers(
  displayLimit = PUBLIC_SIM_NUMBER_LIST_LIMIT,
): Promise<{
  available: number;
  shown: number;
  numbers: PublicAvailableNumberItem[];
}> {
  await releaseExpiredSimCheckoutHoldsBestEffort();
  const heldIds = await getPendingSimBundleHeldInventoryIds();
  const sb = getSupabase();
  const { data, error } = await sb
    .from("real_number_inventory")
    .select("id, e164_number, sales_status, connection_status, webhook_connected, metadata")
    .eq("sales_status", "connected_available")
    .eq("connection_status", "connected")
    .eq("webhook_connected", true)
    .order("updated_at", { ascending: true })
    .limit(200);

  if (error) {
    if (isMissingTableError(error)) {
      return { available: 0, shown: 0, numbers: [] };
    }
    throw wrapSupabaseError(error, "listPublicAvailableNumbers");
  }

  const eligible = (data ?? [])
    .filter(
      (row) =>
        isInventoryPubliclySellable(row as { id: string; sales_status?: string; connection_status?: string; webhook_connected?: boolean }) &&
        !heldIds.has(String(row.id)),
    )
    .map((row) => {
      const e164 = String(row.e164_number);
      const digits = e164.replace(/\D/g, "");
      return {
        inventory_public_id: inventoryPublicId(String(row.id)),
        display_number: maskE164ChileMobile(e164),
        suffix: digits.slice(-3),
        plan_eligible: [...PUBLIC_PLAN_ELIGIBLE],
      };
    });

  const shown = Math.min(displayLimit, eligible.length);
  return {
    available: eligible.length,
    shown,
    numbers: eligible.slice(0, displayLimit),
  };
}

export async function getPublicAvailability(): Promise<PublicRealNumberAvailability> {
  const { available } = await listPublicAvailableNumbers(
    PUBLIC_SIM_NUMBER_LIST_LIMIT,
  );
  return {
    available,
    in_stock: available > 0,
  };
}

async function pickConnectedAvailableId(): Promise<string | null> {
  await releaseExpiredSimCheckoutHoldsBestEffort();
  const heldIds = await getPendingSimBundleHeldInventoryIds();
  const sb = getSupabase();
  const { data, error } = await sb
    .from("real_number_inventory")
    .select("id, sales_status, connection_status, webhook_connected, metadata")
    .eq("sales_status", "connected_available")
    .eq("connection_status", "connected")
    .eq("webhook_connected", true)
    .order("updated_at", { ascending: true })
    .limit(200);

  if (error) {
    if (isMissingTableError(error)) return null;
    throw wrapSupabaseError(error, "pickConnectedAvailableId");
  }

  const pick = (data ?? []).find(
    (row) =>
      isInventoryPubliclySellable(row as { id: string; sales_status?: string; connection_status?: string; webhook_connected?: boolean }) &&
      !heldIds.has(String(row.id)),
  );
  return pick?.id != null ? String(pick.id) : null;
}

export async function reserveAvailableNumberForCheckout(input: {
  orderId: string;
  simActivationRequestId?: string;
  inventoryId?: string;
}): Promise<RealNumberInventoryRow> {
  return reserveInventoryNumberForCheckout(input);
}

export async function reserveInventoryNumberForCheckout(input: {
  orderId: string;
  simActivationRequestId?: string;
  inventoryId?: string;
}): Promise<RealNumberInventoryRow> {
  await releaseExpiredSimCheckoutHoldsBestEffort();

  let inventoryId = input.inventoryId ?? (await pickConnectedAvailableId());
  if (!inventoryId) {
    throw new AppError(
      "No hay números reales disponibles en este momento.",
      409,
      "NO_STOCK",
    );
  }

  const reservedUntil = new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000);
  const sb = getSupabase();
  const patch: Record<string, unknown> = {
    sales_status: "reserved_pending_payment",
    current_order_id: input.orderId,
    reserved_until: reservedUntil.toISOString(),
  };
  if (input.simActivationRequestId) {
    patch.current_agent_request_id = input.simActivationRequestId;
  }

  const { data, error } = await sb
    .from("real_number_inventory")
    .update(patch)
    .eq("id", inventoryId)
    .eq("sales_status", "connected_available")
    .eq("connection_status", "connected")
    .eq("webhook_connected", true)
    .select("*")
    .maybeSingle();

  if (error) {
    throw wrapSupabaseError(error, "reserveInventoryNumberForCheckout");
  }

  if (!data) {
    throw new AppError(
      "Este número acaba de ser reservado. Elige otra numeración disponible.",
      409,
      "NUMBER_UNAVAILABLE",
    );
  }

  return mapRow(data as Record<string, unknown>);
}

/** Resuelve inventory_public_id contra inventario vendible online. */
export async function resolvePublicInventoryId(
  publicId: string,
): Promise<string | null> {
  await releaseExpiredSimCheckoutHoldsBestEffort();
  const sb = getSupabase();
  const { data, error } = await sb
    .from("real_number_inventory")
    .select("id, sales_status, connection_status, webhook_connected, metadata")
    .eq("sales_status", "connected_available")
    .eq("connection_status", "connected")
    .eq("webhook_connected", true)
    .limit(50);
  if (error) {
    if (isMissingTableError(error)) return null;
    throw wrapSupabaseError(error, "resolvePublicInventoryId");
  }
  const heldIds = await getPendingSimBundleHeldInventoryIds();
  const internalIds = (data ?? [])
    .filter((r) =>
      isInventoryPubliclySellable(
        r as {
          id: string;
          sales_status?: string;
          connection_status?: string;
          webhook_connected?: boolean;
          metadata?: Record<string, unknown> | null;
        },
      ),
    )
    .map((r) => String(r.id))
    .filter((id) => !heldIds.has(id));
  return resolveInventoryIdFromPublicId(publicId, internalIds);
}

export { inventoryPublicId };

export async function releaseReservationForOrder(orderId: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from("real_number_inventory")
    .update({
      sales_status: "connected_available",
      current_order_id: null,
      current_agent_request_id: null,
      reserved_until: null,
    })
    .eq("current_order_id", orderId)
    .eq("sales_status", "reserved_pending_payment");

  if (error) {
    if (isMissingTableError(error)) return;
    throw wrapSupabaseError(error, "releaseReservationForOrder");
  }
}

/** Número listo para asignación automática post-pago (conectado + webhook probado). */
export function isInventoryTechnicallyReady(
  row: Pick<
    RealNumberInventoryRow,
    "connection_status" | "webhook_connected" | "sales_status"
  >,
): boolean {
  return (
    row.connection_status === "connected" &&
    row.webhook_connected === true &&
    ["reserved_pending_payment", "sold_pending_activation"].includes(
      row.sales_status,
    )
  );
}

export async function markNumberPaymentApproved(input: {
  orderId: string;
  simActivationRequestId?: string;
}): Promise<RealNumberInventoryRow | null> {
  const sb = getSupabase();
  const patch: Record<string, unknown> = {
    sales_status: "sold_pending_activation",
    reserved_until: null,
  };
  if (input.simActivationRequestId) {
    patch.current_agent_request_id = input.simActivationRequestId;
  }

  const { data, error } = await sb
    .from("real_number_inventory")
    .update(patch)
    .eq("current_order_id", input.orderId)
    .in("sales_status", ["reserved_pending_payment", "sold_pending_activation"])
    .select("*")
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw wrapSupabaseError(error, "markNumberPaymentApproved");
  }

  return data ? mapRow(data as Record<string, unknown>) : null;
}

export type SimCheckoutHoldReleaseResult = {
  releasedInventoryCount: number;
  clearedMetadataHolds: number;
};

async function clearOrderInventoryHoldMetadata(
  orderId: string,
  reason: string,
): Promise<boolean> {
  const sb = getSupabase();
  const { data: order, error: fetchError } = await sb
    .from("sms_orders")
    .select("id, metadata, payment_status, credit_status")
    .eq("id", orderId)
    .maybeSingle();

  if (fetchError) {
    if (isMissingTableError(fetchError)) return false;
    throw wrapSupabaseError(fetchError, "clearOrderInventoryHoldMetadata");
  }
  if (!order || order.payment_status !== "pending") return false;
  if (String(order.credit_status ?? "") === "credited") return false;

  const meta =
    order.metadata && typeof order.metadata === "object"
      ? { ...(order.metadata as Record<string, unknown>) }
      : {};

  const activationStatus = String(meta.activation_status ?? "");
  if (
    activationStatus === "paid_pending_activation" ||
    activationStatus === "active"
  ) {
    return false;
  }

  if (meta.inventory_hold_released_at || meta.reservation_released_at) {
    return false;
  }

  const inventoryId = meta.inventory_number_id;
  if (typeof inventoryId !== "string" || !inventoryId.trim()) {
    return false;
  }

  const releasedAt = new Date().toISOString();
  delete meta.inventory_number_id;
  delete meta.inventory_public_id;
  delete meta.selected_number_masked;
  delete meta.number_suffix;
  delete meta.selected_by_customer;
  meta.inventory_hold_released_at = releasedAt;
  meta.reservation_released_at = releasedAt;
  meta.inventory_hold_release_reason = reason;

  const { error: updateError } = await sb
    .from("sms_orders")
    .update({ metadata: meta })
    .eq("id", orderId)
    .eq("payment_status", "pending");

  if (updateError) {
    throw wrapSupabaseError(updateError, "clearOrderInventoryHoldMetadata");
  }

  return true;
}

async function releaseExpiredDbReservationsBestEffort(): Promise<number> {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const { data: expiredRows, error: fetchError } = await sb
    .from("real_number_inventory")
    .select("id, current_order_id")
    .eq("sales_status", "reserved_pending_payment")
    .lt("reserved_until", now);

  if (fetchError) {
    if (isMissingTableError(fetchError)) return 0;
    throw wrapSupabaseError(fetchError, "releaseExpiredDbReservationsBestEffort");
  }

  let released = 0;
  for (const row of expiredRows ?? []) {
    const orderId =
      row.current_order_id != null ? String(row.current_order_id) : null;

    if (orderId) {
      const { data: order } = await sb
        .from("sms_orders")
        .select("payment_status, credit_status, metadata")
        .eq("id", orderId)
        .maybeSingle();

      if (order?.payment_status !== "pending") continue;
      if (String(order.credit_status ?? "") === "credited") continue;

      const meta =
        order.metadata && typeof order.metadata === "object"
          ? (order.metadata as Record<string, unknown>)
          : {};
      const activationStatus = String(meta.activation_status ?? "");
      if (
        activationStatus === "paid_pending_activation" ||
        activationStatus === "active"
      ) {
        continue;
      }
    }

    const { error: releaseError } = await sb
      .from("real_number_inventory")
      .update({
        sales_status: "connected_available",
        current_order_id: null,
        current_agent_request_id: null,
        reserved_until: null,
      })
      .eq("id", String(row.id))
      .eq("sales_status", "reserved_pending_payment");

    if (releaseError) {
      throw wrapSupabaseError(releaseError, "releaseExpiredDbReservationsBestEffort");
    }
    released += 1;
    if (orderId) {
      await clearOrderInventoryHoldMetadata(
        orderId,
        "auto_expired_checkout_hold",
      ).catch(() => undefined);
    }
  }

  return released;
}

/**
 * Libera holds SIM de checkout pending con más de SIM_CHECKOUT_HOLD_TTL_MINUTES.
 * No cancela órdenes ni modifica pagos en MercadoPago.
 */
export async function releaseExpiredSimCheckoutHoldsBestEffort(): Promise<SimCheckoutHoldReleaseResult> {
  let releasedInventoryCount = 0;
  let clearedMetadataHolds = 0;
  const sb = getSupabase();
  const now = Date.now();
  const ttlMs = SIM_CHECKOUT_HOLD_TTL_MINUTES * 60 * 1000;

  releasedInventoryCount += await releaseExpiredDbReservationsBestEffort();

  const { data: reservedRows, error: reservedFetchError } = await sb
    .from("real_number_inventory")
    .select("id, current_order_id, reserved_until")
    .eq("sales_status", "reserved_pending_payment");

  if (reservedFetchError) {
    if (!isMissingTableError(reservedFetchError)) {
      throw wrapSupabaseError(
        reservedFetchError,
        "releaseExpiredSimCheckoutHoldsBestEffort",
      );
    }
  } else {
    for (const row of reservedRows ?? []) {
      const orderId =
        row.current_order_id != null ? String(row.current_order_id) : null;
      if (!orderId) continue;

      const { data: order } = await sb
        .from("sms_orders")
        .select("payment_status, credit_status, created_at, metadata")
        .eq("id", orderId)
        .maybeSingle();

      if (!order || order.payment_status !== "pending") continue;
      if (String(order.credit_status ?? "") === "credited") continue;

      const meta =
        order.metadata && typeof order.metadata === "object"
          ? (order.metadata as Record<string, unknown>)
          : {};
      const activationStatus = String(meta.activation_status ?? "");
      if (
        activationStatus === "paid_pending_activation" ||
        activationStatus === "active"
      ) {
        continue;
      }

      const createdAt = String(order.created_at ?? new Date().toISOString());
      const reservedUntil =
        row.reserved_until != null ? String(row.reserved_until) : null;
      const expired = isSimCheckoutHoldExpired(createdAt, reservedUntil);
      if (!expired) continue;

      try {
        await releaseReservationById(String(row.id));
        releasedInventoryCount += 1;
        if (
          await clearOrderInventoryHoldMetadata(
            orderId,
            "auto_expired_checkout_hold",
          )
        ) {
          clearedMetadataHolds += 1;
        }
      } catch {
        // best-effort: otro proceso pudo liberar la fila
      }
    }
  }

  const { data: pendingOrders, error: ordersError } = await sb
    .from("sms_orders")
    .select("id, payment_status, credit_status, created_at, metadata")
    .eq("payment_status", "pending");

  if (ordersError) {
    throw wrapSupabaseError(ordersError, "releaseExpiredSimCheckoutHoldsBestEffort");
  }

  for (const order of pendingOrders ?? []) {
    const meta =
      order.metadata && typeof order.metadata === "object"
        ? (order.metadata as Record<string, unknown>)
        : {};
    if (
      meta.product_type !== "sim_agent_bundle" &&
      meta.product_type !== "sim_subscription"
    ) {
      continue;
    }
    if (meta.inventory_hold_released_at || meta.reservation_released_at) {
      continue;
    }

    const inventoryId = meta.inventory_number_id;
    if (typeof inventoryId !== "string" || !inventoryId.trim()) continue;

    const createdAt = String(order.created_at ?? new Date().toISOString());
    if (now - new Date(createdAt).getTime() <= ttlMs) continue;

    const activationStatus = String(meta.activation_status ?? "");
    if (
      activationStatus === "paid_pending_activation" ||
      activationStatus === "active"
    ) {
      continue;
    }
    if (String(order.credit_status ?? "") === "credited") continue;

    if (
      await clearOrderInventoryHoldMetadata(
        String(order.id),
        "auto_expired_checkout_hold",
      )
    ) {
      clearedMetadataHolds += 1;
    }

    const inv = await getInventoryById(inventoryId.trim());
    if (
      inv &&
      inv.sales_status === "reserved_pending_payment" &&
      inv.current_order_id === String(order.id)
    ) {
      try {
        await releaseReservationById(inv.id);
        releasedInventoryCount += 1;
      } catch {
        // best-effort
      }
    }
  }

  return { releasedInventoryCount, clearedMetadataHolds };
}

/** @deprecated Usar releaseExpiredSimCheckoutHoldsBestEffort */
export async function releaseExpiredReservation(): Promise<number> {
  const result = await releaseExpiredSimCheckoutHoldsBestEffort();
  return result.releasedInventoryCount;
}

/** Evita activar automáticamente un número liberado o reasignado tras pago tardío. */
export async function canOrderClaimInventoryOnPayment(input: {
  orderId: string;
  inventoryNumberId: string;
}): Promise<{ claimable: boolean; reason?: string }> {
  const sb = getSupabase();
  const { data: order } = await sb
    .from("sms_orders")
    .select("metadata")
    .eq("id", input.orderId)
    .maybeSingle();

  const meta =
    order?.metadata && typeof order.metadata === "object"
      ? (order.metadata as Record<string, unknown>)
      : {};

  if (meta.inventory_hold_released_at || meta.reservation_released_at) {
    return { claimable: false, reason: "reservation_released" };
  }

  const inventory = await getInventoryById(input.inventoryNumberId);
  if (!inventory) {
    return { claimable: false, reason: "inventory_missing" };
  }

  if (
    inventory.current_company_id ||
    inventory.sales_status === "active_assigned"
  ) {
    return { claimable: false, reason: "inventory_assigned" };
  }

  if (
    inventory.current_order_id &&
    inventory.current_order_id !== input.orderId &&
    ["reserved_pending_payment", "sold_pending_activation"].includes(
      inventory.sales_status,
    )
  ) {
    return { claimable: false, reason: "inventory_claimed_by_other_order" };
  }

  if (
    inventory.sales_status === "connected_available" &&
    inventory.current_order_id !== input.orderId
  ) {
    return { claimable: false, reason: "reservation_released" };
  }

  if (
    inventory.sales_status === "reserved_pending_payment" &&
    inventory.current_order_id === input.orderId
  ) {
    return { claimable: true };
  }

  if (
    inventory.sales_status === "sold_pending_activation" &&
    inventory.current_order_id === input.orderId
  ) {
    return { claimable: true };
  }

  if (inventory.current_order_id === input.orderId) {
    return { claimable: true };
  }

  return { claimable: false, reason: "inventory_not_reserved_for_order" };
}

export async function markWebhookConnected(
  inventoryId: string,
  input?: {
    webhookUrl?: string;
    gatewayId?: string;
    simSlot?: string;
  },
): Promise<RealNumberInventoryRow> {
  const sb = getSupabase();
  const row = await getInventoryById(inventoryId);
  if (!row) {
    throw new AppError("Número de inventario no encontrado.", 404);
  }

  const patch: Record<string, unknown> = {
    webhook_connected: true,
    connection_status: "connected",
    sales_status:
      row.sales_status === "preconfigured_pending" ||
      row.sales_status === "released"
        ? "connected_available"
        : row.sales_status,
  };
  if (input?.webhookUrl !== undefined) patch.webhook_url = input.webhookUrl || null;
  if (input?.gatewayId !== undefined) patch.gateway_id = input.gatewayId || null;
  if (input?.simSlot !== undefined) patch.sim_slot = input.simSlot || null;

  const { data, error } = await sb
    .from("real_number_inventory")
    .update(patch)
    .eq("id", inventoryId)
    .select("*")
    .single();

  if (error) throw wrapSupabaseError(error, "markWebhookConnected");
  return mapRow(data as Record<string, unknown>);
}

export async function markWebhookConnectedBatch(
  inventoryIds: string[],
): Promise<{ updated: number; skipped: number }> {
  let updated = 0;
  let skipped = 0;
  for (const inventoryId of inventoryIds) {
    const row = await getInventoryById(inventoryId);
    if (!row || row.sales_status !== "preconfigured_pending") {
      skipped += 1;
      continue;
    }
    await markWebhookConnected(inventoryId);
    updated += 1;
  }
  return { updated, skipped };
}

/**
 * Libera retención expirada: reserva DB o hold lógico por orden SIM pending.
 * No cancela la orden ni modifica payment_status. Solo superadmin (controlador).
 */
export async function releaseExpiredInventoryHold(
  inventoryId: string,
  audit?: {
    adminUserId: string;
    adminRole?: string | null;
    ipAddress?: string | null;
  },
): Promise<RealNumberInventoryRow> {
  const row = await getInventoryById(inventoryId);
  if (!row) {
    throw new AppError("Número de inventario no encontrado.", 404);
  }

  if (
    row.current_company_id ||
    row.sales_status === "active_assigned" ||
    row.sales_status === "sold_pending_activation"
  ) {
    throw new AppError(
      "No se puede liberar: numeración asignada, activa o vendida.",
      400,
    );
  }

  const heldDetails = await getPendingSimBundleHeldInventoryDetails();
  const eligibility = getPublicInventoryEligibility(row, {
    heldByOrder: heldDetails.get(inventoryId) ?? null,
  });

  if (!eligibility.canReleaseExpiredHold) {
    throw new AppError(
      "Solo se puede liberar manualmente una retención expirada (mínimo 30 min).",
      400,
    );
  }

  const releaseReason = "manual_expired_hold_release";
  const releasedAt = new Date().toISOString();

  if (row.sales_status === "reserved_pending_payment") {
    const expired =
      row.reserved_until != null &&
      new Date(row.reserved_until).getTime() < Date.now();
    if (!expired) {
      throw new AppError("La reserva aún está activa.", 400);
    }
    if (row.current_order_id) {
      const sb = getSupabase();
      const { data: order } = await sb
        .from("sms_orders")
        .select("id, payment_status, credit_status")
        .eq("id", row.current_order_id)
        .maybeSingle();
      if (!order || order.payment_status !== "pending") {
        throw new AppError(
          "La orden asociada ya no está pending; no se libera.",
          409,
        );
      }
      if (String(order.credit_status ?? "") === "credited") {
        throw new AppError("La orden ya fue acreditada; no se libera.", 409);
      }
    }
    const released = await releaseReservationById(inventoryId);
    if (audit?.adminUserId) {
      await insertAuditLog({
        actorUserId: audit.adminUserId,
        actorRole: audit.adminRole ?? null,
        action: releaseReason,
        entityType: "real_number_inventory",
        entityId: inventoryId,
        metadata: {
          order_id: row.current_order_id,
          inventory_number_id: inventoryId,
          timestamp: releasedAt,
          reason: releaseReason,
        },
        ipAddress: audit.ipAddress ?? null,
      });
    }
    return released;
  }

  const hold = heldDetails.get(inventoryId);
  if (!hold?.reservationExpired) {
    throw new AppError("El checkout pendiente aún retiene este número.", 400);
  }

  const sb = getSupabase();
  const { data: order, error: fetchError } = await sb
    .from("sms_orders")
    .select("id, metadata, payment_status, credit_status")
    .eq("id", hold.orderId)
    .maybeSingle();

  if (fetchError) {
    throw wrapSupabaseError(fetchError, "releaseExpiredInventoryHold");
  }
  if (!order || order.payment_status !== "pending") {
    throw new AppError("La orden pending asociada ya no retiene este número.", 409);
  }
  if (String(order.credit_status ?? "") === "credited") {
    throw new AppError("La orden ya fue acreditada; no se libera.", 409);
  }

  const meta =
    order.metadata && typeof order.metadata === "object"
      ? { ...(order.metadata as Record<string, unknown>) }
      : {};

  const activationStatus = String(meta.activation_status ?? "");
  if (
    activationStatus === "paid_pending_activation" ||
    activationStatus === "active"
  ) {
    throw new AppError(
      "La orden SIM ya avanzó en activación/pago; no se libera el hold.",
      409,
    );
  }

  delete meta.inventory_number_id;
  delete meta.inventory_public_id;
  delete meta.selected_number_masked;
  delete meta.number_suffix;
  delete meta.selected_by_customer;
  meta.inventory_hold_released_at = releasedAt;
  meta.inventory_hold_release_reason = releaseReason;
  if (audit?.adminUserId) {
    meta.inventory_hold_released_by_admin_user_id = audit.adminUserId;
  }

  const { error: updateError } = await sb
    .from("sms_orders")
    .update({ metadata: meta })
    .eq("id", hold.orderId)
    .eq("payment_status", "pending");

  if (updateError) {
    throw wrapSupabaseError(updateError, "releaseExpiredInventoryHold");
  }

  if (audit?.adminUserId) {
    await insertAuditLog({
      actorUserId: audit.adminUserId,
      actorRole: audit.adminRole ?? null,
      action: releaseReason,
      entityType: "real_number_inventory",
      entityId: inventoryId,
      metadata: {
        order_id: hold.orderId,
        inventory_number_id: inventoryId,
        timestamp: releasedAt,
        reason: releaseReason,
      },
      ipAddress: audit.ipAddress ?? null,
    });
  }

  const refreshed = await getInventoryById(inventoryId);
  if (!refreshed) {
    throw new AppError("Inventario no encontrado tras liberar hold.", 500);
  }
  return refreshed;
}

export async function markInventoryNotForSale(
  inventoryId: string,
): Promise<RealNumberInventoryRow> {
  const row = await getInventoryById(inventoryId);
  if (!row) {
    throw new AppError("Número de inventario no encontrado.", 404);
  }
  if (["active_assigned", "reserved_pending_payment"].includes(row.sales_status)) {
    throw new AppError(
      "No se puede marcar como no vendible (estado incompatible).",
      400,
    );
  }

  const sb = getSupabase();
  const { data, error } = await sb
    .from("real_number_inventory")
    .update({ sales_status: "not_for_sale" })
    .eq("id", inventoryId)
    .select("*")
    .single();

  if (error) throw wrapSupabaseError(error, "markInventoryNotForSale");
  return mapRow(data as Record<string, unknown>);
}

export async function assignInventoryNumberToCompany(input: {
  inventoryId: string;
  companyId: string;
  clientNumberId: string;
  simActivationRequestId?: string;
  planCode?: string;
}): Promise<RealNumberInventoryRow> {
  const existing = await getInventoryById(input.inventoryId);
  if (!existing) {
    throw new AppError("Número de inventario no encontrado.", 404);
  }
  if (
    existing.sales_status === "active_assigned" &&
    existing.current_company_id === input.companyId &&
    existing.current_client_number_id === input.clientNumberId
  ) {
    return existing;
  }
  if (existing.sales_status === "active_assigned") {
    throw new AppError("El número ya está asignado a un cliente.", 400);
  }

  const assignableStatuses: RealNumberSalesStatus[] = [
    "sold_pending_activation",
    "reserved_pending_payment",
    "connected_available",
    "preconfigured_pending",
  ];
  if (!assignableStatuses.includes(existing.sales_status)) {
    throw new AppError(
      "El número no está en estado asignable.",
      400,
    );
  }

  const sb = getSupabase();
  const metadata = {
    ...existing.metadata,
    ...(input.planCode ? { assigned_plan_code: input.planCode } : {}),
    assigned_at: new Date().toISOString(),
  };
  const patch: Record<string, unknown> = {
    sales_status: "active_assigned",
    current_company_id: input.companyId,
    current_client_number_id: input.clientNumberId,
    current_order_id: null,
    reserved_until: null,
    metadata,
  };
  if (input.simActivationRequestId) {
    patch.current_agent_request_id = input.simActivationRequestId;
  }

  const { data, error } = await sb
    .from("real_number_inventory")
    .update(patch)
    .eq("id", input.inventoryId)
    .in("sales_status", assignableStatuses)
    .select("*")
    .maybeSingle();

  if (error) throw wrapSupabaseError(error, "assignInventoryNumberToCompany");
  if (!data) {
    throw new AppError(
      "El número no está en estado asignable (vendido/reservado/disponible).",
      400,
    );
  }
  return mapRow(data as Record<string, unknown>);
}

export async function releaseReservationById(
  inventoryId: string,
): Promise<RealNumberInventoryRow> {
  const row = await getInventoryById(inventoryId);
  if (!row) {
    throw new AppError("Número de inventario no encontrado.", 404);
  }
  if (row.sales_status !== "reserved_pending_payment") {
    throw new AppError("Solo se pueden liberar números en reserva de checkout.", 400);
  }

  const sb = getSupabase();
  const { data, error } = await sb
    .from("real_number_inventory")
    .update({
      sales_status: "connected_available",
      current_order_id: null,
      current_agent_request_id: null,
      reserved_until: null,
    })
    .eq("id", inventoryId)
    .eq("sales_status", "reserved_pending_payment")
    .select("*")
    .single();

  if (error) throw wrapSupabaseError(error, "releaseReservationById");
  return mapRow(data as Record<string, unknown>);
}

export async function createInventoryNumber(input: {
  e164_number: string;
  country_code?: string;
  provider?: string;
  webhook_connected?: boolean;
  connection_status?: RealNumberConnectionStatus;
  sales_status?: RealNumberSalesStatus;
  gateway_id?: string;
  sim_slot?: string;
  webhook_url?: string;
  metadata?: Record<string, unknown>;
}): Promise<RealNumberInventoryRow> {
  const sb = getSupabase();
  const e164 = input.e164_number.trim();
  if (!e164) {
    throw new AppError("e164_number requerido.", 400);
  }

  const { data: existing } = await sb
    .from("real_number_inventory")
    .select("id")
    .eq("e164_number", e164)
    .maybeSingle();

  if (existing?.id) {
    throw new AppError("Ese número ya existe en inventario.", 409);
  }

  const payload = {
    e164_number: e164,
    country_code: input.country_code ?? "CL",
    provider: input.provider ?? "telsim",
    webhook_connected: input.webhook_connected ?? false,
    connection_status: input.connection_status ?? "preconfigured_pending",
    sales_status: input.sales_status ?? "preconfigured_pending",
    gateway_id: input.gateway_id ?? null,
    sim_slot: input.sim_slot ?? null,
    webhook_url: input.webhook_url ?? null,
    metadata: input.metadata ?? {},
  };

  const { data, error } = await sb
    .from("real_number_inventory")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw wrapSupabaseError(error, "createInventoryNumber");
  return mapRow(data as Record<string, unknown>);
}

export async function assignInventoryNumberManual(input: {
  inventoryId: string;
  companyId: string;
  planCode?: string;
  simActivationRequestId?: string;
}): Promise<{ inventory: RealNumberInventoryRow; clientNumberId: string }> {
  const inventory = await getInventoryById(input.inventoryId);
  if (!inventory) {
    throw new AppError("Número de inventario no encontrado.", 404);
  }

  const created = await createAdminClientNumber({
    company_id: input.companyId,
    number: inventory.e164_number,
    country_code: inventory.country_code,
    type: "sim_real",
    status: "active",
    provider: inventory.provider,
    sim_slot: inventory.sim_slot ?? undefined,
    gateway_id: inventory.gateway_id ?? undefined,
  });

  const updated = await assignInventoryNumberToCompany({
    inventoryId: inventory.id,
    companyId: input.companyId,
    clientNumberId: created.id,
    simActivationRequestId: input.simActivationRequestId || undefined,
    planCode: input.planCode || undefined,
  });

  if (input.simActivationRequestId) {
    const { updateSimActivationStatus } = await import("./simActivationService.js");
    await updateSimActivationStatus(input.simActivationRequestId, "active");
  }

  return { inventory: updated, clientNumberId: created.id };
}

export function realNumberSalesStatusLabel(status: RealNumberSalesStatus): string {
  const map: Record<RealNumberSalesStatus, string> = {
    connected_available: "Conectado — disponible",
    preconfigured_pending: "Preconfigurado — pendiente conexión",
    not_for_sale: "No vendible",
    reserved_pending_payment: "Reservado (checkout)",
    sold_pending_activation: "Vendido — pendiente activación",
    active_assigned: "Activo — asignado",
    suspended: "Suspendido",
    released: "Liberado",
  };
  return map[status] ?? status;
}

export function realNumberConnectionStatusLabel(
  status: RealNumberConnectionStatus,
): string {
  const map: Record<RealNumberConnectionStatus, string> = {
    connected: "Conectado",
    preconfigured_pending: "Pendiente conexión",
    connection_error: "Error de conexión",
    disabled: "Deshabilitado",
  };
  return map[status] ?? status;
}

export async function upsertInventoryNumber(input: {
  e164_number: string;
  country_code?: string;
  provider?: string;
  webhook_connected?: boolean;
  connection_status?: RealNumberConnectionStatus;
  sales_status?: RealNumberSalesStatus;
  gateway_id?: string;
  sim_slot?: string;
  webhook_url?: string;
  metadata?: Record<string, unknown>;
}): Promise<RealNumberInventoryRow> {
  const sb = getSupabase();
  const e164 = input.e164_number.trim();
  if (!e164) {
    throw new AppError("e164_number requerido.", 400);
  }

  const { data: existing } = await sb
    .from("real_number_inventory")
    .select("id")
    .eq("e164_number", e164)
    .maybeSingle();

  const payload = {
    e164_number: e164,
    country_code: input.country_code ?? "CL",
    provider: input.provider ?? "telsim",
    webhook_connected: input.webhook_connected ?? false,
    connection_status: input.connection_status ?? "preconfigured_pending",
    sales_status: input.sales_status ?? "preconfigured_pending",
    gateway_id: input.gateway_id ?? null,
    sim_slot: input.sim_slot ?? null,
    webhook_url: input.webhook_url ?? null,
    metadata: input.metadata ?? {},
  };

  if (existing?.id) {
    const { data, error } = await sb
      .from("real_number_inventory")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw wrapSupabaseError(error, "upsertInventoryNumber.update");
    return mapRow(data as Record<string, unknown>);
  }

  const { data, error } = await sb
    .from("real_number_inventory")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw wrapSupabaseError(error, "upsertInventoryNumber.insert");
  return mapRow(data as Record<string, unknown>);
}
