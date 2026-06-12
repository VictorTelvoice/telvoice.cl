import { getSupabase } from "../database/supabaseClient.js";
import { createAdminClientNumber } from "./adminClientNumberService.js";
import type {
  PublicRealNumberAvailability,
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
  const sb = getSupabase();
  const held = new Set<string>();

  const { data: reservedRows, error: reservedError } = await sb
    .from("real_number_inventory")
    .select("id")
    .eq("sales_status", "reserved_pending_payment");

  if (reservedError) {
    if (isMissingTableError(reservedError)) return held;
    throw wrapSupabaseError(reservedError, "getPendingSimBundleHeldInventoryIds");
  }

  for (const row of reservedRows ?? []) {
    held.add(String(row.id));
  }

  const { data: pendingOrders, error: ordersError } = await sb
    .from("sms_orders")
    .select("id, metadata")
    .eq("payment_status", "pending");

  if (ordersError) {
    throw wrapSupabaseError(ordersError, "getPendingSimBundleHeldInventoryIds");
  }

  for (const order of pendingOrders ?? []) {
    const meta =
      order.metadata && typeof order.metadata === "object"
        ? (order.metadata as Record<string, unknown>)
        : {};
    if (meta.product_type !== "sim_agent_bundle") continue;
    const inventoryId = meta.inventory_number_id;
    if (typeof inventoryId === "string" && inventoryId.trim()) {
      held.add(inventoryId.trim());
    }
  }

  return held;
}

function isInventoryPubliclySellable(row: {
  id: string;
  sales_status?: string;
  connection_status?: string;
  webhook_connected?: boolean;
}): boolean {
  return (
    row.sales_status === "connected_available" &&
    row.connection_status === "connected" &&
    row.webhook_connected === true
  );
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
  limit = 10,
): Promise<PublicAvailableNumberItem[]> {
  await releaseExpiredReservation();
  const heldIds = await getPendingSimBundleHeldInventoryIds();
  const sb = getSupabase();
  const { data, error } = await sb
    .from("real_number_inventory")
    .select("id, e164_number, sales_status, connection_status, webhook_connected")
    .eq("sales_status", "connected_available")
    .eq("connection_status", "connected")
    .eq("webhook_connected", true)
    .order("updated_at", { ascending: true })
    .limit(Math.max(limit, 50));

  if (error) {
    if (isMissingTableError(error)) return [];
    throw wrapSupabaseError(error, "listPublicAvailableNumbers");
  }

  return (data ?? [])
    .filter(
      (row) =>
        isInventoryPubliclySellable(row as { id: string; sales_status?: string; connection_status?: string; webhook_connected?: boolean }) &&
        !heldIds.has(String(row.id)),
    )
    .slice(0, limit)
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
}

export async function getPublicAvailability(): Promise<PublicRealNumberAvailability> {
  await releaseExpiredReservation();
  const numbers = await listPublicAvailableNumbers(50);
  return {
    available: numbers.length,
    in_stock: numbers.length > 0,
  };
}

async function pickConnectedAvailableId(): Promise<string | null> {
  const heldIds = await getPendingSimBundleHeldInventoryIds();
  const sb = getSupabase();
  const { data, error } = await sb
    .from("real_number_inventory")
    .select("id, sales_status, connection_status, webhook_connected")
    .eq("sales_status", "connected_available")
    .eq("connection_status", "connected")
    .eq("webhook_connected", true)
    .order("updated_at", { ascending: true })
    .limit(50);

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
  await releaseExpiredReservation();

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
  await releaseExpiredReservation();
  const sb = getSupabase();
  const { data, error } = await sb
    .from("real_number_inventory")
    .select("id")
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

export async function releaseExpiredReservation(): Promise<number> {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const { data: expiredRows, error: fetchError } = await sb
    .from("real_number_inventory")
    .select("id, current_order_id")
    .eq("sales_status", "reserved_pending_payment")
    .lt("reserved_until", now);

  if (fetchError) {
    if (isMissingTableError(fetchError)) return 0;
    throw wrapSupabaseError(fetchError, "releaseExpiredReservation");
  }

  let released = 0;
  for (const row of expiredRows ?? []) {
    const orderId =
      row.current_order_id != null ? String(row.current_order_id) : null;

    if (orderId) {
      const { data: order } = await sb
        .from("sms_orders")
        .select("payment_status, metadata")
        .eq("id", orderId)
        .maybeSingle();

      if (order?.payment_status === "pending") {
        const meta =
          order.metadata && typeof order.metadata === "object"
            ? (order.metadata as Record<string, unknown>)
            : {};
        if (meta.product_type === "sim_agent_bundle") {
          const reservedUntil = new Date(
            Date.now() + RESERVATION_MINUTES * 60 * 1000,
          );
          await sb
            .from("real_number_inventory")
            .update({ reserved_until: reservedUntil.toISOString() })
            .eq("id", String(row.id))
            .eq("sales_status", "reserved_pending_payment")
            .eq("current_order_id", orderId);
          continue;
        }
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
      throw wrapSupabaseError(releaseError, "releaseExpiredReservation");
    }
    released += 1;
  }

  return released;
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
