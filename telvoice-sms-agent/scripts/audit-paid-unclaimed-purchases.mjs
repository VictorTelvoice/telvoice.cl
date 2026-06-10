#!/usr/bin/env node
/**
 * Lista compras pagadas sin wallet credit (read-only) con elegibilidad.
 */
import "dotenv/config";

const { listPaidUnclaimedPurchases } = await import(
  "../src/services/billingPurchaseReconciliationService.ts"
);

const rows = await listPaidUnclaimedPurchases();

const summary = {
  total: rows.length,
  eligible: rows.filter((r) => r.eligibility === "eligible").length,
  manual_review_blocked: rows.filter((r) => r.eligibility === "manual_review_blocked")
    .length,
  qa_blocked: rows.filter((r) => r.eligibility === "qa_blocked").length,
  company_conflict: rows.filter((r) => r.eligibility === "company_conflict").length,
};

console.log(JSON.stringify({ summary, rows }, null, 2));
