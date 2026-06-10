import { normalizeAuditEmail } from "../../src/services/adminDataAuditClassifier.ts";

const CREDIT_TYPES = new Set(["purchase_credit", "manual_credit"]);
const DEBIT_TYPES = new Set([
  "manual_debit",
  "sms_debit",
  "reserve",
  "adjustment",
  "reversal",
]);

export function ledgerSmsDelta(tx) {
  const amount = Number(tx.sms_amount ?? 0);
  if (amount === 0) return 0;
  if (CREDIT_TYPES.has(tx.type)) return amount;
  if (DEBIT_TYPES.has(tx.type)) return -Math.abs(amount);
  if (tx.balance_after != null && tx.balance_before != null) {
    return Number(tx.balance_after) - Number(tx.balance_before);
  }
  return amount;
}

export async function loadWalletLedgerAudit(sb, input = {}) {
  const norm = input.email ? normalizeAuditEmail(input.email) : null;
  let companyId = input.companyId ?? null;
  let company = null;

  if (!companyId && norm) {
    const { data: companies, error } = await sb
      .from("companies")
      .select("id,name,billing_email,status,metadata,created_at,updated_at")
      .ilike("billing_email", norm);
    if (error) throw error;
    company = (companies ?? [])[0] ?? null;
    companyId = company?.id ?? null;
  }

  if (companyId && !company) {
    const { data, error } = await sb
      .from("companies")
      .select("id,name,billing_email,status,metadata,created_at,updated_at")
      .eq("id", companyId)
      .maybeSingle();
    if (error) throw error;
    company = data;
  }

  const wallets = companyId
    ? (
        await sb
          .from("company_sms_wallets")
          .select("*")
          .eq("company_id", companyId)
      ).data ?? []
    : [];

  const transactions = companyId
    ? (
        await sb
          .from("wallet_transactions")
          .select("*")
          .eq("company_id", companyId)
          .order("created_at", { ascending: true })
      ).data ?? []
    : [];

  const ordersByCompany = companyId
    ? (
        await sb
          .from("sms_orders")
          .select(
            "id,package_id,sms_quantity,amount,currency,payment_status,credit_status,claim_status,company_id,checkout_email,payer_email,metadata,public_checkout_reference,created_at,credited_at,payment_provider,payment_reference",
          )
          .eq("company_id", companyId)
      ).data ?? []
    : [];

  const ordersByEmail =
    norm && !companyId
      ? (
          await sb
            .from("sms_orders")
            .select(
              "id,package_id,sms_quantity,amount,currency,payment_status,credit_status,claim_status,company_id,checkout_email,payer_email,metadata,public_checkout_reference,created_at,credited_at,payment_provider,payment_reference",
            )
            .or(`checkout_email.ilike.${norm},payer_email.ilike.${norm}`)
        ).data ?? []
      : [];

  const ordersMap = new Map();
  for (const row of [...ordersByCompany, ...ordersByEmail]) {
    ordersMap.set(row.id, row);
  }
  const orders = [...ordersMap.values()].sort((a, b) =>
    String(a.created_at).localeCompare(String(b.created_at)),
  );

  const orderIds = orders.map((o) => o.id);
  const invoiceIds = [];
  const invoices =
    orderIds.length > 0
      ? (
          await sb
            .from("billing_invoices")
            .select("*")
            .in("order_id", orderIds)
            .order("created_at", { ascending: true })
        ).data ?? []
      : [];
  for (const inv of invoices) invoiceIds.push(inv.id);

  const billingEmailLogs =
    invoiceIds.length > 0 || norm
      ? (
          await sb
            .from("billing_email_logs")
            .select("*")
            .or(
              [
                invoiceIds.length > 0
                  ? `invoice_id.in.(${invoiceIds.join(",")})`
                  : null,
                norm ? `to_email_normalized.eq.${norm}` : null,
              ]
                .filter(Boolean)
                .join(","),
            )
            .order("created_at", { ascending: true })
        ).data ?? []
      : [];

  const emailLogs =
    orderIds.length > 0
      ? (
          await sb
            .from("email_logs")
            .select("*")
            .in("order_id", orderIds)
            .order("created_at", { ascending: true })
        ).data ?? []
      : [];

  const purchaseCredits = transactions.filter((t) => t.type === "purchase_credit");
  const manualCredits = transactions.filter((t) => t.type === "manual_credit");
  const debits = transactions.filter((t) => DEBIT_TYPES.has(t.type));

  const sumPurchaseCredit = purchaseCredits.reduce(
    (s, t) => s + Number(t.sms_amount ?? 0),
    0,
  );
  const sumManualCredit = manualCredits.reduce(
    (s, t) => s + Number(t.sms_amount ?? 0),
    0,
  );
  const sumDebits = debits.reduce(
    (s, t) => s + Math.abs(Number(t.sms_amount ?? 0)),
    0,
  );
  const ledgerNet = transactions.reduce((s, t) => s + ledgerSmsDelta(t), 0);

  const wallet = wallets[0] ?? null;
  const availableSms = wallet?.available_sms ?? null;
  const walletVsLedgerDiff =
    availableSms == null ? null : availableSms - ledgerNet;

  const paidRealOrders = orders.filter((o) => o.payment_status === "paid");
  const purchaseCreditByOrderId = Object.fromEntries(
    purchaseCredits.map((t) => [
      t.reference_type === "sms_order" ? t.reference_id : t.metadata?.order_id,
      t,
    ]),
  );

  const orphanBalanceDetected =
    walletVsLedgerDiff != null && walletVsLedgerDiff > 0;

  return {
    email: norm,
    company,
    companyId,
    wallet,
    wallets,
    transactions,
    orders,
    invoices,
    billingEmailLogs,
    emailLogs,
    metrics: {
      company_id: companyId,
      wallet_id: wallet?.id ?? null,
      available_sms: availableSms,
      total_purchased_sms: wallet?.total_purchased_sms ?? null,
      consumed_sms: wallet?.consumed_sms ?? null,
      reserved_sms: wallet?.reserved_sms ?? null,
      sum_purchase_credit: sumPurchaseCredit,
      sum_manual_credit: sumManualCredit,
      sum_debits: sumDebits,
      ledger_net_sms: ledgerNet,
      wallet_vs_ledger_diff: walletVsLedgerDiff,
      paid_real_orders_count: paidRealOrders.length,
      purchase_credit_by_order_id: purchaseCreditByOrderId,
      purchase_credits_without_order_ref: purchaseCredits.filter(
        (t) => t.reference_type !== "sms_order" || !t.reference_id,
      ),
      orphan_balance_detected: orphanBalanceDetected,
      recommended_correction_sms: orphanBalanceDetected ? walletVsLedgerDiff : 0,
      recommended_final_available_sms:
        orphanBalanceDetected && availableSms != null
          ? availableSms - walletVsLedgerDiff
          : availableSms,
    },
  };
}

export function buildAuditReport(audit, options = {}) {
  const { metrics, company, wallet, transactions, orders, invoices, billingEmailLogs, emailLogs } =
    audit;

  let recommendation = "Sin acción: wallet y ledger coinciden.";
  if (metrics.orphan_balance_detected) {
    recommendation = `Saldo huérfano detectado (+${metrics.wallet_vs_ledger_diff} SMS sin respaldo ledger). Corrección sugerida: debitar ${metrics.recommended_correction_sms} SMS para dejar available_sms en ${metrics.recommended_final_available_sms}.`;
  } else if (metrics.wallet_vs_ledger_diff < 0) {
    recommendation = `Wallet menor que ledger (${metrics.wallet_vs_ledger_diff} SMS). Revisión manual requerida; no aplicar script de corrección huérfana.`;
  }

  return {
    mode: "read_only_audit",
    at: new Date().toISOString(),
    email: audit.email,
    company,
    summary: {
      company_id: metrics.company_id,
      wallet_id: metrics.wallet_id,
      available_sms: metrics.available_sms,
      total_purchased_sms: metrics.total_purchased_sms,
      consumed_sms: metrics.consumed_sms,
      reserved_sms: metrics.reserved_sms,
      sum_ledger_purchase_credit: metrics.sum_purchase_credit,
      sum_ledger_manual_credit: metrics.sum_manual_credit,
      sum_ledger_debits: metrics.sum_debits,
      ledger_net_sms: metrics.ledger_net_sms,
      wallet_vs_ledger_diff: metrics.wallet_vs_ledger_diff,
      paid_real_orders_count: metrics.paid_real_orders_count,
      purchase_credit_by_order_id: metrics.purchase_credit_by_order_id,
      transactions_without_order_ref: metrics.purchase_credits_without_order_ref.length,
      orphan_balance_detected: metrics.orphan_balance_detected,
      recommended_correction_sms: metrics.recommended_correction_sms,
      recommended_final_available_sms: metrics.recommended_final_available_sms,
      recommendation,
    },
    wallet_transactions_chronological: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      sms_amount: t.sms_amount,
      balance_before: t.balance_before,
      balance_after: t.balance_after,
      reference_type: t.reference_type,
      reference_id: t.reference_id,
      order_id:
        t.reference_type === "sms_order" ? t.reference_id : t.metadata?.order_id ?? null,
      description: t.description,
      metadata: t.metadata,
      created_at: t.created_at,
      created_by: t.created_by,
    })),
    orders: orders.map((o) => ({
      order_id: o.id,
      package_id: o.package_id,
      sms_quantity: o.sms_quantity,
      amount: o.amount,
      payment_status: o.payment_status,
      credit_status: o.credit_status,
      claim_status: o.claim_status,
      company_id: o.company_id,
      checkout_email: o.checkout_email,
      payer_email: o.payer_email,
      created_at: o.created_at,
      credited_at: o.credited_at,
    })),
    billing: {
      invoices,
      billing_email_logs: billingEmailLogs,
      email_logs: emailLogs,
    },
    ...options.extra,
  };
}
