#!/usr/bin/env node
/**
 * Lista compras pagadas sin wallet credit (read-only).
 * npm run audit:paid-unclaimed-purchases --prefix telvoice-sms-agent
 */
import "dotenv/config";

const { listPaidUnclaimedPurchases } = await import(
  "../src/services/billingPurchaseReconciliationService.ts"
);

const rows = await listPaidUnclaimedPurchases();
console.log(
  JSON.stringify(
    {
      total: rows.length,
      rows,
    },
    null,
    2,
  ),
);
