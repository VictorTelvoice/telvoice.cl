import assert from "node:assert/strict";
import {
  agentSalesFiltersToQuery,
  computeAgentSalesKpis,
  dateRangeToBounds,
  isAgentPanelOrder,
  parseAgentSalesFilters,
} from "../src/services/agent/agentSalesMetricsService.js";
import { isManualQuoteRequired } from "../src/services/telvoicePricingService.js";
import type { SmsOrderRow } from "../src/types/wallet.js";

function mockOrder(
  partial: Partial<SmsOrderRow> & { metadata?: Record<string, unknown> },
): SmsOrderRow {
  return {
    id: partial.id ?? "00000000-0000-4000-8000-000000000001",
    company_id: partial.company_id ?? "c1",
    package_id: null,
    sms_quantity: partial.sms_quantity ?? 1000,
    amount: partial.amount ?? 11900,
    currency: "CLP",
    payment_provider: "mercadopago",
    payment_reference: null,
    payment_status: partial.payment_status ?? "pending",
    credit_status: partial.credit_status ?? "pending",
    credited_at: null,
    created_by: null,
    metadata: partial.metadata ?? { source: "agent_panel" },
    created_at: partial.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function run(): void {
  assert.equal(isAgentPanelOrder({ metadata: { source: "agent_panel" } }), true);
  assert.equal(isAgentPanelOrder({ metadata: { source: "client_panel" } }), false);

  const orders = [
    mockOrder({
      payment_status: "pending",
      amount: 10000,
      metadata: {
        source: "agent_panel",
        mercadopago_init_point: "https://mp.test/1",
        agent_sms_quantity: 1000,
      },
    }),
    mockOrder({
      id: "00000000-0000-4000-8000-000000000002",
      payment_status: "paid",
      amount: 20000,
      metadata: {
        source: "agent_panel",
        mercadopago_preference_id: "pref-2",
        agent_sms_quantity: 2000,
        agent_blocked_send: { required_sms: 500 },
      },
    }),
  ];

  const kpis = computeAgentSalesKpis({
    orders,
    quotesCount: 3,
    blockedCount: 1,
  });

  assert.equal(kpis.paymentLinksGenerated, 2);
  assert.equal(kpis.pendingOrders, 1);
  assert.equal(kpis.paidOrders, 1);
  assert.equal(kpis.potentialAmountClp, 30000);
  assert.equal(kpis.paidAmountClp, 20000);
  assert.equal(kpis.smsSold, 2000);
  assert.equal(kpis.conversionRate, 0.5);
  assert.equal(kpis.averagePaidOrderClp, 20000);
  assert.equal(kpis.blockedByBalance, 1);

  const empty = computeAgentSalesKpis({ orders: [], quotesCount: 0, blockedCount: 0 });
  assert.equal(empty.conversionRate, 0);
  assert.equal(empty.averagePaidOrderClp, 0);

  const filters = parseAgentSalesFilters({
    date_range: "7d",
    company_id: "abc",
    payment_status: "paid",
    min_sms: "1000",
  });
  assert.equal(filters.dateRange, "7d");
  assert.equal(filters.companyId, "abc");
  assert.equal(filters.minSms, 1000);

  const q = agentSalesFiltersToQuery(filters);
  assert.ok(q.includes("date_range=7d"));

  const bounds = dateRangeToBounds("today");
  assert.ok(bounds.from);
  assert.ok(bounds.to);

  assert.equal(isManualQuoteRequired(120_001), true);
  assert.equal(isManualQuoteRequired(120_000), false);

  console.log("[test-agent-sales-metrics] OK");
}

run();
