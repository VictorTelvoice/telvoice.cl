import { getSupabase } from "../database/supabaseClient.js";
import type { BillingInvoiceItem } from "../types/billing.js";
import type { SmsOrderRow } from "../types/wallet.js";
import { getSmsPackageById } from "./smsPackageService.js";

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function createItemsForInvoiceFromOrder(
  invoiceId: string,
  order: SmsOrderRow,
): Promise<BillingInvoiceItem[]> {
  const { data: existing, error: existingError } = await getSupabase()
    .from("billing_invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .limit(10);

  if (existingError) {
    console.warn("[billing] createItemsForInvoiceFromOrder existing check failed", existingError);
  }
  if (existing && existing.length > 0) {
    return existing as BillingInvoiceItem[];
  }

  const pkg = order.package_id ? await getSmsPackageById(order.package_id) : null;
  const description = pkg?.name ?? "Bolsa SMS";

  const total = toNumber(order.amount);
  const taxRate = 0;
  const taxAmount = 0;
  const subtotal = total;

  const { data, error } = await getSupabase()
    .from("billing_invoice_items")
    .insert({
      invoice_id: invoiceId,
      order_id: order.id,
      package_id: order.package_id,
      description,
      quantity: 1,
      unit_price: total,
      subtotal,
      tax_amount: taxAmount,
      total,
      metadata: {
        source: "order",
        order_currency: order.currency,
        tax_rate: taxRate,
      },
    })
    .select("*");

  if (error) {
    console.warn("[billing] createItemsForInvoiceFromOrder insert failed", error);
    // Re-consulta para responder determinísticamente (idempotencia por unique index)
    const { data: after } = await getSupabase()
      .from("billing_invoice_items")
      .select("*")
      .eq("invoice_id", invoiceId)
      .limit(10);
    return (after ?? []) as BillingInvoiceItem[];
  }

  return (data ?? []) as BillingInvoiceItem[];
}

