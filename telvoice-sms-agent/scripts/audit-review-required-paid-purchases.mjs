#!/usr/bin/env node
/**
 * Auditoría read-only: cuentas REVIEW_REQUIRED / ORPHAN con compras MP pagadas.
 */
import "dotenv/config";

const { auditReviewRequiredPaidPurchases } = await import(
  "../src/services/reviewRequiredPaidPurchaseService.ts"
);

const { summary, rows } = await auditReviewRequiredPaidPurchases();

const eligibleEmails = [
  ...new Set(
    rows
      .filter((r) => r.riskStatus === "eligible")
      .map((r) => r.email)
      .filter(Boolean),
  ),
];

const blocked = rows
  .filter((r) => r.riskStatus !== "eligible" && r.riskStatus !== "already_credited")
  .map((r) => ({
    email: r.email,
    orderId: r.orderId,
    riskStatus: r.riskStatus,
    recommendedAction: r.recommendedAction,
    reason: r.reconcileStatus ?? r.riskStatus,
  }));

console.log(
  JSON.stringify(
    {
      summary,
      eligibleEmails,
      blocked,
      rows,
    },
    null,
    2,
  ),
);
