/**
 * Flujo comercial de compra SMS en agente panel.
 */
import assert from "node:assert/strict";
import {
  calculateTelvoiceQuote,
  isManualQuoteRequired,
  recommendBagQuantityForShortfall,
  roundSmsQuantityToThousand,
} from "../src/services/telvoicePricingService.js";
import {
  detectPurchaseIntent,
  PURCHASE_FLOW_STEP,
} from "../src/services/agent/agentPurchaseFlow.js";
import { extractCommercialQuantity } from "../src/services/agent/agentCommercialText.js";

async function testPricingTiers(): Promise<void> {
  const cases: [number, number, number][] = [
    [1000, 10, 11_900],
    [4000, 10, 47_600],
    [5000, 9, 53_550],
    [9000, 9, 96_390],
    [10000, 8, 95_200],
    [14000, 8, 133_280],
    [15000, 7, 124_950],
    [30000, 7, 249_900],
    [50000, 6, 357_000],
    [70000, 6, 499_800],
    [100000, 5, 595_000],
    [120000, 5, 714_000],
  ];

  for (const [qty, unit, total] of cases) {
    const q = await calculateTelvoiceQuote(qty);
    assert.equal(q.unit_price, unit, `unit ${qty}`);
    assert.equal(q.total_with_iva, total, `total ${qty}`);
  }

  const rounded = await calculateTelvoiceQuote(12_500);
  assert.equal(rounded.quoted_quantity, 13_000);
  assert.equal(rounded.total_with_iva, 123_760);

  assert.ok(isManualQuoteRequired(121_000));
  assert.equal(roundSmsQuantityToThousand(12_500), 13_000);
  console.log("✓ pricing tiers y redondeo");
}

function testShortfallBag(): void {
  assert.equal(recommendBagQuantityForShortfall(206), 1000);
  assert.equal(recommendBagQuantityForShortfall(1000), 1000);
  assert.equal(recommendBagQuantityForShortfall(1001), 2000);
  console.log("✓ bolsa recomendada por faltante");
}

function testPurchaseIntent(): void {
  assert.ok(detectPurchaseIntent("quiero comprar sms", {}));
  assert.ok(detectPurchaseIntent("cargar saldo", {}));
  assert.ok(
    detectPurchaseIntent("generar link de pago", {
      purchaseFlowStep: PURCHASE_FLOW_STEP.REVIEW_QUOTE,
      pendingPurchaseQuote: {
        quoted_quantity: 1000,
      } as never,
    }),
  );
  assert.ok(extractCommercialQuantity("quiero comprar 30000 mensajes") === 30_000);
  console.log("✓ detección intención compra");
}

async function main(): Promise<void> {
  console.log("=== test:agent-purchase-flow ===\n");
  await testPricingTiers();
  testShortfallBag();
  testPurchaseIntent();
  console.log("\nTodos los casos pasaron.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
