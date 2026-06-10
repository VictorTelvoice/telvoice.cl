import { createPgClient } from "../database/pgClient.js";
import {
  listAdminClientsForScope,
} from "./adminClientsListService.js";
import {
  normalizeAuditEmail,
  orderHasRealPayment,
  orderLooksQa,
} from "./adminDataAuditClassifier.js";

const TEST_EMAIL_RE = /@(telvoice\.test|example\.invalid)$/i;

export function isExplicitTestPurchaseEmail(email: string): boolean {
  const e = normalizeAuditEmail(email);
  return !e || TEST_EMAIL_RE.test(e);
}

/** IDs de empresas consideradas producción real para métricas operativas. */
export async function loadProductionCompanyIds(): Promise<Set<string>> {
  const realList = await listAdminClientsForScope({ scope: "real" });
  const ids = new Set(realList.items.map((item) => item.company.id));

  const client = createPgClient();
  await client.connect();
  try {
    const paidOrders = await client.query(`
      SELECT id, company_id, checkout_email, payer_email, payment_status,
             credit_status, metadata
      FROM sms_orders
      WHERE payment_status = 'paid'
    `);
    for (const row of paidOrders.rows) {
      if (!orderHasRealPayment(row) || orderLooksQa(row)) continue;
      const email = normalizeAuditEmail(
        row.checkout_email ?? row.payer_email,
      );
      if (isExplicitTestPurchaseEmail(email)) continue;
      if (row.company_id) {
        ids.add(String(row.company_id));
      }
    }

    const paidByEmail = await client.query(`
      SELECT DISTINCT c.id::text AS company_id
      FROM sms_orders o
      JOIN companies c ON lower(c.billing_email) = lower(coalesce(o.checkout_email, o.payer_email, ''))
      WHERE o.payment_status = 'paid'
        AND coalesce(o.checkout_email, o.payer_email, '') <> ''
        AND NOT (lower(coalesce(o.checkout_email, o.payer_email, '')) ~ '@(telvoice\\.test|example\\.invalid)$')
    `);
    for (const row of paidByEmail.rows) {
      if (row.company_id) ids.add(String(row.company_id));
    }
  } finally {
    await client.end();
  }

  return ids;
}

export function companyIdsToPgArray(ids: Set<string>): string[] {
  return [...ids];
}
