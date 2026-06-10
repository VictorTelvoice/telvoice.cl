#!/usr/bin/env node
/**
 * Corrige saldo huérfano en wallet (solo casos validados, empezando por jaoyarzu).
 * Dry-run por defecto. Apply requiere --apply y confirmación literal.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { normalizeAuditEmail } from "../src/services/adminDataAuditClassifier.ts";
import { loadWalletLedgerAudit } from "./lib/wallet-ledger-audit.mjs";

const APPLY_CONFIRM_PHRASE = "CORREGIR SALDO HUERFANO JAOYARZU";

const JAOYARZU = {
  email: "jaoyarzu@gmail.com",
  companyId: "f889a7f5-0a54-4425-b8cd-ab80bd0e770e",
  walletId: "70e34278-82ed-4a0e-a397-3f0a1c637aaa",
  orderId: "577e3915-fc3d-4742-857c-b67d0c363618",
  purchaseCreditId: "134c1896-3644-4d42-9e8c-c4fe4f97305e",
  expectedAvailableSms: 400,
  expectedTotalPurchasedSms: 400,
  expectedConsumedSms: 0,
  expectedReservedSms: 0,
  expectedSmsAmount: 200,
  expectedOrderSmsQuantity: 200,
  expectedPurchaseCreditBalanceBefore: 200,
  expectedPurchaseCreditBalanceAfter: 400,
  correctionKey: "orphan_balance_jaoyarzu_577e3915_20260610",
};

function arg(name) {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)?.trim();
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const companyId = arg("company-id");
const smsAmount = Number(arg("sms-amount"));
const reason = arg("reason") ?? "orphan_balance_pre_review_required_reconcile";
const referenceOrder = arg("reference-order");
const confirm = arg("confirm");
const apply = hasFlag("apply");
const dryRun = !apply;

if (!companyId || !smsAmount || !referenceOrder) {
  console.error(
    "Uso: npm run correct:wallet-orphan-balance -- --company-id=<uuid> --sms-amount=200 --reference-order=<order_id> [--reason=...] [--dry-run|--apply --confirm=\"...\"]",
  );
  process.exit(1);
}

if (apply && confirm !== APPLY_CONFIRM_PHRASE) {
  console.error(`Apply requiere --confirm="${APPLY_CONFIRM_PHRASE}"`);
  process.exit(1);
}

const { getSupabase } = await import("../src/database/supabaseClient.ts");
const { insertAuditLog } = await import("../src/services/auditLogService.ts");
const sb = getSupabase();

function mismatch(code, detail) {
  return { ok: false, code, detail };
}

async function validateJaoyarzuCorrection(audit) {
  const checks = [];
  const fail = (code, detail) => {
    checks.push({ ok: false, code, detail });
    return false;
  };

  const companyEmail = normalizeAuditEmail(audit.company?.billing_email);
  if (companyId !== JAOYARZU.companyId) {
    return { ok: false, checks: [mismatch("company_id_not_allowed", { companyId })] };
  }
  if (companyEmail !== JAOYARZU.email) {
    fail("email_mismatch", { companyEmail, expected: JAOYARZU.email });
  }
  if (referenceOrder !== JAOYARZU.orderId) {
    fail("reference_order_mismatch", { referenceOrder, expected: JAOYARZU.orderId });
  }
  if (smsAmount !== JAOYARZU.expectedSmsAmount) {
    fail("sms_amount_mismatch", { smsAmount, expected: JAOYARZU.expectedSmsAmount });
  }

  const wallet = audit.wallet;
  if (!wallet) fail("wallet_missing", {});
  else {
    if (wallet.id !== JAOYARZU.walletId) fail("wallet_id_mismatch", { walletId: wallet.id });
    if (wallet.status !== "active") fail("wallet_not_active", { status: wallet.status });
    if (wallet.available_sms !== JAOYARZU.expectedAvailableSms) {
      fail("available_sms_mismatch", {
        available_sms: wallet.available_sms,
        expected: JAOYARZU.expectedAvailableSms,
      });
    }
    if (wallet.total_purchased_sms !== JAOYARZU.expectedTotalPurchasedSms) {
      fail("total_purchased_sms_mismatch", {
        total_purchased_sms: wallet.total_purchased_sms,
        expected: JAOYARZU.expectedTotalPurchasedSms,
      });
    }
    if (wallet.consumed_sms !== JAOYARZU.expectedConsumedSms) {
      fail("consumed_sms_mismatch", { consumed_sms: wallet.consumed_sms });
    }
    if (wallet.reserved_sms !== JAOYARZU.expectedReservedSms) {
      fail("reserved_sms_mismatch", { reserved_sms: wallet.reserved_sms });
    }
  }

  const paidOrders = audit.orders.filter((o) => o.payment_status === "paid");
  if (paidOrders.length !== 1) {
    fail("paid_orders_count_mismatch", { count: paidOrders.length, expected: 1 });
  } else {
    const order = paidOrders[0];
    if (order.id !== JAOYARZU.orderId) fail("paid_order_id_mismatch", { orderId: order.id });
    if (order.sms_quantity !== JAOYARZU.expectedOrderSmsQuantity) {
      fail("order_sms_quantity_mismatch", { sms_quantity: order.sms_quantity });
    }
    if (order.credit_status !== "credited") {
      fail("order_not_credited", { credit_status: order.credit_status });
    }
  }

  const purchaseCredits = audit.transactions.filter((t) => t.type === "purchase_credit");
  const orderCredits = purchaseCredits.filter(
    (t) => t.reference_type === "sms_order" && t.reference_id === JAOYARZU.orderId,
  );
  if (purchaseCredits.length !== 1) {
    fail("purchase_credit_count_mismatch", { count: purchaseCredits.length, expected: 1 });
  }
  if (orderCredits.length !== 1) {
    fail("order_purchase_credit_count_mismatch", { count: orderCredits.length, expected: 1 });
  } else {
    const tx = orderCredits[0];
    if (tx.id !== JAOYARZU.purchaseCreditId) {
      fail("purchase_credit_id_mismatch", { id: tx.id, expected: JAOYARZU.purchaseCreditId });
    }
    if (tx.balance_before !== JAOYARZU.expectedPurchaseCreditBalanceBefore) {
      fail("purchase_credit_balance_before_mismatch", { balance_before: tx.balance_before });
    }
    if (tx.balance_after !== JAOYARZU.expectedPurchaseCreditBalanceAfter) {
      fail("purchase_credit_balance_after_mismatch", { balance_after: tx.balance_after });
    }
  }

  const manualCredits = audit.transactions.filter((t) => t.type === "manual_credit");
  if (manualCredits.length > 0) fail("manual_credit_exists", { count: manualCredits.length });

  const debits = audit.transactions.filter(
    (t) =>
      t.type === "manual_debit" ||
      t.type === "sms_debit" ||
      t.type === "adjustment" ||
      t.type === "reversal",
  );
  if (debits.length > 0) fail("debit_exists", { count: debits.length });

  const priorCorrection = audit.transactions.find(
    (t) => t.metadata?.correction_key === JAOYARZU.correctionKey,
  );
  if (priorCorrection) {
    fail("correction_already_applied", { transaction_id: priorCorrection.id });
  }

  if (!audit.metrics.orphan_balance_detected) {
    fail("orphan_balance_not_detected", {
      wallet_vs_ledger_diff: audit.metrics.wallet_vs_ledger_diff,
    });
  }
  if (audit.metrics.wallet_vs_ledger_diff !== smsAmount) {
    fail("orphan_amount_mismatch", {
      diff: audit.metrics.wallet_vs_ledger_diff,
      smsAmount,
    });
  }

  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    return { ok: false, checks: failed };
  }

  checks.push({ ok: true, code: "all_safety_checks_passed" });
  return {
    ok: true,
    checks,
    purchaseCredit: orderCredits[0] ?? null,
  };
}

const audit = await loadWalletLedgerAudit(getSupabase(), {
  companyId,
  email: JAOYARZU.email,
});

const validation = await validateJaoyarzuCorrection(audit);
if (!validation.ok) {
  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry_run_aborted" : "apply_aborted",
        at: new Date().toISOString(),
        validation_failed: true,
        checks: validation.checks,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const wallet = audit.wallet;
const beforeAvailable = wallet.available_sms;
const beforeTotalPurchased = wallet.total_purchased_sms;
const finalAvailable = beforeAvailable - smsAmount;
const finalTotalPurchased = beforeTotalPurchased - smsAmount;

const plannedTransaction = {
  type: "adjustment",
  sms_amount: smsAmount,
  balance_before: beforeAvailable,
  balance_after: finalAvailable,
  reference_type: "wallet_correction",
  reference_id: referenceOrder,
  description: "Corrección de saldo huérfano sin respaldo ledger — jaoyarzu",
  metadata: {
    correction_key: JAOYARZU.correctionKey,
    correction_type: "orphan_balance_reversal",
    reason,
    evidence_order_id: JAOYARZU.orderId,
    evidence_purchase_credit_id: JAOYARZU.purchaseCreditId,
    expected_final_balance: finalAvailable,
    reviewed_by: "superadmin",
    created_by_script: "correct-wallet-orphan-balance",
  },
};

const dryRunReport = {
  mode: dryRun ? "dry_run" : "apply",
  at: new Date().toISOString(),
  company_id: companyId,
  email: JAOYARZU.email,
  wallet_id: wallet.id,
  validation_checks: validation.checks,
  before: {
    available_sms: beforeAvailable,
    total_purchased_sms: beforeTotalPurchased,
    consumed_sms: wallet.consumed_sms,
    reserved_sms: wallet.reserved_sms,
    ledger_net_sms: audit.metrics.ledger_net_sms,
    wallet_vs_ledger_diff: audit.metrics.wallet_vs_ledger_diff,
  },
  planned: {
    correction_sms: -smsAmount,
    final_available_sms: finalAvailable,
    final_total_purchased_sms: finalTotalPurchased,
    insert_correction_transaction: true,
    correction_transaction: plannedTransaction,
    no_order_change: true,
    no_invoice_change: true,
    no_email_change: true,
  },
};

if (dryRun) {
  console.log(JSON.stringify({ ...dryRunReport, apply_executed: false }, null, 2));
  process.exit(0);
}

const correctionId = randomUUID();
const { data: insertedTx, error: txError } = await sb
  .from("wallet_transactions")
  .insert({
    company_id: companyId,
    wallet_id: wallet.id,
    type: plannedTransaction.type,
    sms_amount: plannedTransaction.sms_amount,
    balance_before: plannedTransaction.balance_before,
    balance_after: plannedTransaction.balance_after,
    reference_type: plannedTransaction.reference_type,
    reference_id: referenceOrder,
    description: plannedTransaction.description,
    created_by: null,
    metadata: {
      ...plannedTransaction.metadata,
      correction_id: correctionId,
    },
  })
  .select("*")
  .single();

if (txError) {
  console.log(
    JSON.stringify(
      {
        mode: "apply_failed",
        at: new Date().toISOString(),
        error: txError.message,
        dryRunReport,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const { data: updatedWallet, error: walletError } = await sb
  .from("company_sms_wallets")
  .update({
    available_sms: finalAvailable,
    total_purchased_sms: finalTotalPurchased,
    updated_at: new Date().toISOString(),
  })
  .eq("id", wallet.id)
  .eq("available_sms", beforeAvailable)
  .eq("total_purchased_sms", beforeTotalPurchased)
  .select("*")
  .maybeSingle();

if (walletError || !updatedWallet) {
  console.log(
    JSON.stringify(
      {
        mode: "apply_partial_failure",
        at: new Date().toISOString(),
        warning:
          "Transacción de corrección insertada pero wallet no actualizada (posible condición de carrera). Revisar manualmente.",
        inserted_transaction_id: insertedTx?.id,
        wallet_error: walletError?.message ?? "optimistic_lock_failed",
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

await insertAuditLog({
  actorUserId: null,
  actorRole: "superadmin",
  companyId,
  action: "wallet.debit",
  entityType: "company_sms_wallet",
  entityId: wallet.id,
  metadata: {
    correction_key: JAOYARZU.correctionKey,
    correction_type: "orphan_balance_reversal",
    sms_amount: smsAmount,
    reason,
    reference_order: referenceOrder,
    wallet_transaction_id: insertedTx.id,
    before_available_sms: beforeAvailable,
    after_available_sms: finalAvailable,
    script: "correct-wallet-orphan-balance",
  },
});

const afterAudit = await loadWalletLedgerAudit(sb, {
  companyId,
  email: JAOYARZU.email,
});

console.log(
  JSON.stringify(
    {
      ...dryRunReport,
      apply_executed: true,
      inserted_transaction: insertedTx,
      wallet_after: updatedWallet,
      ledger_after: afterAudit.metrics,
    },
    null,
    2,
  ),
);
