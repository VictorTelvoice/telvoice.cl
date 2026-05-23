import { getSupabase } from "../database/supabaseClient.js";
import { insertAuditLog } from "./auditLogService.js";
import { isDuplicateKeyError } from "../utils/supabase-errors.js";
import { getSmsPackageById } from "./smsPackageService.js";
import { applyPurchaseCredit } from "./smsWalletService.js";
import type { SmsOrderRow, SmsOrderWithDetails } from "../types/wallet.js";
import { isMissingTableError } from "../utils/db-table.js";
import { CLIENT_PANEL_ORDER_METADATA } from "../utils/order-display.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

export async function getOrderById(id: string): Promise<SmsOrderRow | null> {
  const { data, error } = await getSupabase()
    .from("sms_orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "getOrderById");
  }

  return data as SmsOrderRow | null;
}

export async function getOrderForCompany(
  orderId: string,
  companyId: string,
): Promise<SmsOrderRow | null> {
  const order = await getOrderById(orderId);
  if (!order || order.company_id !== companyId) {
    return null;
  }
  return order;
}

export async function getOrderWithDetailsForCompany(
  orderId: string,
  companyId: string,
): Promise<SmsOrderWithDetails | null> {
  const order = await getOrderForCompany(orderId, companyId);
  if (!order) {
    return null;
  }

  let package_name: string | undefined;
  if (order.package_id) {
    const pkg = await getSmsPackageById(order.package_id);
    package_name = pkg?.name;
  }

  const { data: company } = await getSupabase()
    .from("companies")
    .select("id, name")
    .eq("id", companyId)
    .maybeSingle();

  return {
    ...order,
    company_name: (company as { name?: string } | null)?.name,
    package_name,
  };
}

export async function listSmsOrdersByCompany(
  companyId: string,
  limit = 50,
): Promise<SmsOrderWithDetails[]> {
  const { data, error } = await getSupabase()
    .from("sms_orders")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listSmsOrdersByCompany");
  }

  const orders = (data ?? []) as SmsOrderRow[];
  if (orders.length === 0) {
    return [];
  }

  const packageIds = [
    ...new Set(orders.map((o) => o.package_id).filter(Boolean)),
  ] as string[];

  const { data: packages } =
    packageIds.length > 0
      ? await getSupabase()
          .from("sms_packages")
          .select("id, name")
          .in("id", packageIds)
      : { data: [] };

  const packageMap = new Map(
    ((packages ?? []) as { id: string; name: string }[]).map((p) => [
      p.id,
      p.name,
    ]),
  );

  const { data: company } = await getSupabase()
    .from("companies")
    .select("id, name")
    .eq("id", companyId)
    .maybeSingle();

  const companyName = (company as { name?: string } | null)?.name;

  return orders.map((o) => ({
    ...o,
    company_name: companyName,
    package_name: o.package_id ? packageMap.get(o.package_id) : undefined,
  }));
}

export async function getOrderWithDetails(
  orderId: string,
): Promise<SmsOrderWithDetails | null> {
  const order = await getOrderById(orderId);
  if (!order) {
    return null;
  }

  let package_name: string | undefined;
  if (order.package_id) {
    const pkg = await getSmsPackageById(order.package_id);
    package_name = pkg?.name;
  }

  const { data: company } = await getSupabase()
    .from("companies")
    .select("id, name")
    .eq("id", order.company_id)
    .maybeSingle();

  return {
    ...order,
    company_name: (company as { name?: string } | null)?.name,
    package_name,
  };
}

export async function listSmsOrders(limit = 100): Promise<SmsOrderWithDetails[]> {
  const { data, error } = await getSupabase()
    .from("sms_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    wrapSupabaseError(error, "listSmsOrders");
  }

  const orders = (data ?? []) as SmsOrderRow[];
  if (orders.length === 0) {
    return [];
  }

  const companyIds = [...new Set(orders.map((o) => o.company_id))];
  const packageIds = [
    ...new Set(orders.map((o) => o.package_id).filter(Boolean)),
  ] as string[];

  const { data: companies } = await getSupabase()
    .from("companies")
    .select("id, name")
    .in("id", companyIds);

  const { data: packages } =
    packageIds.length > 0
      ? await getSupabase()
          .from("sms_packages")
          .select("id, name")
          .in("id", packageIds)
      : { data: [] };

  const companyMap = new Map(
    ((companies ?? []) as { id: string; name: string }[]).map((c) => [
      c.id,
      c.name,
    ]),
  );
  const packageMap = new Map(
    ((packages ?? []) as { id: string; name: string }[]).map((p) => [
      p.id,
      p.name,
    ]),
  );

  return orders.map((o) => ({
    ...o,
    company_name: companyMap.get(o.company_id),
    package_name: o.package_id ? packageMap.get(o.package_id) : undefined,
  }));
}

export async function createOrder(input: {
  companyId: string;
  packageId: string;
  createdBy?: string | null;
  paymentProvider?: string;
  paymentReference?: string;
  metadata?: Record<string, unknown>;
}): Promise<SmsOrderRow> {
  const pkg = await getSmsPackageById(input.packageId);
  if (!pkg || !pkg.is_active) {
    throw new AppError("Bolsa SMS no encontrada o inactiva.", 404);
  }

  const { data, error } = await getSupabase()
    .from("sms_orders")
    .insert({
      company_id: input.companyId,
      package_id: pkg.id,
      sms_quantity: pkg.sms_quantity,
      amount: pkg.total_price,
      currency: pkg.currency,
      payment_provider: input.paymentProvider ?? "manual",
      payment_reference: input.paymentReference ?? null,
      payment_status: "pending",
      credit_status: "pending",
      created_by: input.createdBy ?? null,
      metadata: {
        ...CLIENT_PANEL_ORDER_METADATA,
        ...(input.metadata ?? {}),
      },
    })
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "createOrder");
  }

  return data as SmsOrderRow;
}

export async function patchOrderFields(
  orderId: string,
  patch: {
    payment_reference?: string | null;
    payment_status?: SmsOrderRow["payment_status"];
    credit_status?: SmsOrderRow["credit_status"];
    credited_at?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<SmsOrderRow> {
  const current = await getOrderById(orderId);
  if (!current) {
    throw new AppError("Orden no encontrada.", 404);
  }

  const update: Record<string, unknown> = {};
  if (patch.payment_reference !== undefined) {
    update.payment_reference = patch.payment_reference;
  }
  if (patch.payment_status !== undefined) {
    update.payment_status = patch.payment_status;
  }
  if (patch.credit_status !== undefined) {
    update.credit_status = patch.credit_status;
  }
  if (patch.credited_at !== undefined) {
    update.credited_at = patch.credited_at;
  }
  if (patch.metadata !== undefined) {
    update.metadata = {
      ...(current.metadata ?? {}),
      ...patch.metadata,
    };
  }

  const { data, error } = await getSupabase()
    .from("sms_orders")
    .update(update)
    .eq("id", orderId)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "patchOrderFields");
  }

  return data as SmsOrderRow;
}

/** Cancela orden con pago pendiente (superadmin). No toca wallet. */
export async function cancelPendingOrder(
  orderId: string,
  actorUserId?: string | null,
): Promise<SmsOrderRow> {
  const order = await getOrderById(orderId);
  if (!order) {
    throw new AppError("Orden no encontrada.", 404);
  }
  if (order.payment_status !== "pending") {
    throw new AppError(
      "Solo se pueden cancelar órdenes con pago pendiente.",
      400,
      "ORDER_NOT_PENDING",
    );
  }
  if (order.credit_status === "credited") {
    throw new AppError(
      "No se puede cancelar una orden ya acreditada.",
      400,
      "ORDER_ALREADY_CREDITED",
    );
  }

  const cancelledAt = new Date().toISOString();
  const updated = await patchOrderFields(orderId, {
    payment_status: "cancelled",
    metadata: {
      cancelled_by: "superadmin",
      cancelled_at: cancelledAt,
    },
  });

  await insertAuditLog({
    actorUserId,
    companyId: order.company_id,
    action: "order.cancel",
    entityType: "sms_order",
    entityId: orderId,
    metadata: { payment_status: "cancelled" },
  });

  return updated;
}

export async function markOrderPaid(
  orderId: string,
  actorUserId?: string | null,
): Promise<SmsOrderRow> {
  const order = await getOrderById(orderId);
  if (!order) {
    throw new AppError("Orden no encontrada.", 404);
  }

  if (order.payment_status === "paid") {
    return order;
  }

  const { data, error } = await getSupabase()
    .from("sms_orders")
    .update({ payment_status: "paid" })
    .eq("id", orderId)
    .select("*")
    .single();

  if (error) {
    wrapSupabaseError(error, "markOrderPaid");
  }

  await insertAuditLog({
    actorUserId,
    companyId: order.company_id,
    action: "order.confirm",
    entityType: "sms_order",
    entityId: orderId,
    metadata: { step: "mark_paid" },
  });

  return data as SmsOrderRow;
}

export async function confirmOrderCredit(
  orderId: string,
  actorUserId?: string | null,
  options?: { allowManualWithoutPaid?: boolean },
): Promise<{
  order: SmsOrderRow;
  alreadyCredited: boolean;
}> {
  const order = await getOrderById(orderId);
  if (!order) {
    throw new AppError("Orden no encontrada.", 404);
  }

  if (order.credit_status === "credited") {
    return { order, alreadyCredited: true };
  }

  if (
    order.payment_status !== "paid" &&
    !options?.allowManualWithoutPaid
  ) {
    throw new AppError(
      "La orden debe estar pagada antes de acreditar saldo.",
      400,
    );
  }

  const { data: existingTx } = await getSupabase()
    .from("wallet_transactions")
    .select("id")
    .eq("reference_type", "sms_order")
    .eq("reference_id", orderId)
    .maybeSingle();

  if (existingTx) {
    const { data: synced } = await getSupabase()
      .from("sms_orders")
      .update({
        credit_status: "credited",
        credited_at: order.credited_at ?? new Date().toISOString(),
      })
      .eq("id", orderId)
      .select("*")
      .single();
    return {
      order: (synced ?? order) as SmsOrderRow,
      alreadyCredited: true,
    };
  }

  try {
    await applyPurchaseCredit({
      companyId: order.company_id,
      smsAmount: order.sms_quantity,
      orderId: order.id,
      actorUserId,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const current = await getOrderById(orderId);
      if (current?.credit_status === "credited") {
        return { order: current, alreadyCredited: true };
      }
      const { data: synced } = await getSupabase()
        .from("sms_orders")
        .update({
          credit_status: "credited",
          credited_at: current?.credited_at ?? new Date().toISOString(),
          payment_status:
            current?.payment_status === "pending"
              ? "paid"
              : current?.payment_status,
        })
        .eq("id", orderId)
        .select("*")
        .single();
      return {
        order: (synced ?? current ?? order) as SmsOrderRow,
        alreadyCredited: true,
      };
    }
    throw error;
  }

  const { data, error } = await getSupabase()
    .from("sms_orders")
    .update({
      credit_status: "credited",
      credited_at: new Date().toISOString(),
      payment_status:
        order.payment_status === "pending" ? "paid" : order.payment_status,
    })
    .eq("id", orderId)
    .eq("credit_status", "pending")
    .select("*")
    .maybeSingle();

  if (error) {
    wrapSupabaseError(error, "confirmOrderCredit");
  }

  if (!data) {
    const current = await getOrderById(orderId);
    if (current?.credit_status === "credited") {
      return { order: current, alreadyCredited: true };
    }
    throw new AppError(
      "Saldo acreditado pero la orden no pudo sincronizarse; revisar manualmente.",
      409,
    );
  }

  await insertAuditLog({
    actorUserId,
    companyId: order.company_id,
    action: "order.confirm",
    entityType: "sms_order",
    entityId: orderId,
    metadata: { step: "credit", smsQuantity: order.sms_quantity },
  });

  return { order: data as SmsOrderRow, alreadyCredited: false };
}
