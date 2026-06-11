import { getSupabase } from "../database/supabaseClient.js";
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
  };

  for (const row of data ?? []) {
    const status = String((row as { sales_status?: string }).sales_status);
    if (status === "connected_available") counts.connected_available += 1;
    if (status === "preconfigured_pending") counts.preconfigured_pending += 1;
    if (status === "reserved_pending_payment") counts.reserved += 1;
    if (status === "sold_pending_activation") counts.sold_pending_activation += 1;
    if (status === "active_assigned") counts.active_assigned += 1;
  }

  return counts;
}

export async function getPublicAvailability(): Promise<PublicRealNumberAvailability> {
  await releaseExpiredReservation();
  const summary = await getInventorySummary();
  return {
    available: summary.connected_available,
    in_stock: summary.connected_available > 0,
  };
}

async function pickConnectedAvailableId(): Promise<string | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("real_number_inventory")
    .select("id")
    .eq("sales_status", "connected_available")
    .eq("connection_status", "connected")
    .eq("webhook_connected", true)
    .order("updated_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw wrapSupabaseError(error, "pickConnectedAvailableId");
  }
  return data?.id != null ? String(data.id) : null;
}

export async function reserveAvailableNumberForCheckout(input: {
  orderId: string;
  simActivationRequestId?: string;
}): Promise<RealNumberInventoryRow> {
  await releaseExpiredReservation();

  const inventoryId = await pickConnectedAvailableId();
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
    .select("*")
    .maybeSingle();

  if (error) {
    throw wrapSupabaseError(error, "reserveAvailableNumberForCheckout");
  }

  if (!data) {
    throw new AppError(
      "No hay números reales disponibles en este momento.",
      409,
      "NO_STOCK",
    );
  }

  return mapRow(data as Record<string, unknown>);
}

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
  const { data, error } = await sb
    .from("real_number_inventory")
    .update({
      sales_status: "connected_available",
      current_order_id: null,
      current_agent_request_id: null,
      reserved_until: null,
    })
    .eq("sales_status", "reserved_pending_payment")
    .lt("reserved_until", now)
    .select("id");

  if (error) {
    if (isMissingTableError(error)) return 0;
    throw wrapSupabaseError(error, "releaseExpiredReservation");
  }
  return data?.length ?? 0;
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
}): Promise<RealNumberInventoryRow> {
  const sb = getSupabase();
  const patch: Record<string, unknown> = {
    sales_status: "active_assigned",
    current_company_id: input.companyId,
    current_client_number_id: input.clientNumberId,
    current_order_id: null,
    reserved_until: null,
  };
  if (input.simActivationRequestId) {
    patch.current_agent_request_id = input.simActivationRequestId;
  }

  const { data, error } = await sb
    .from("real_number_inventory")
    .update(patch)
    .eq("id", input.inventoryId)
    .in("sales_status", ["sold_pending_activation", "reserved_pending_payment"])
    .select("*")
    .maybeSingle();

  if (error) throw wrapSupabaseError(error, "assignInventoryNumberToCompany");
  if (!data) {
    throw new AppError(
      "El número no está en estado asignable (vendido/reservado).",
      400,
    );
  }
  return mapRow(data as Record<string, unknown>);
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
