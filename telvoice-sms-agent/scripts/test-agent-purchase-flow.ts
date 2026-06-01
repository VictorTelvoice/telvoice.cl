/**
 * Flujo comercial de compra SMS en agente panel.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  calculateTelvoiceQuote,
  isManualQuoteRequired,
  recommendBagQuantityForShortfall,
  roundSmsQuantityToThousand,
} from "../src/services/telvoicePricingService.js";
import {
  detectPurchaseIntent,
  handleBuySmsFlow,
  hasActivePurchaseQuote,
  isPurchasePaymentConfirmation,
  PURCHASE_FLOW_STEP,
} from "../src/services/agent/agentPurchaseFlow.js";
import { extractCommercialQuantity } from "../src/services/agent/agentCommercialText.js";
import { routeAgentIntent } from "../src/services/agent/agentIntentRouter.js";
import {
  getConversationMemory,
  updateConversationMemory,
} from "../src/services/agent/agentConversationMemory.js";
import { runAgentCore } from "../src/services/agent/agentCore.js";
import type { AgentExecutionContext } from "../src/services/agent/types.js";

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

function testPaymentConfirmationHelper(): void {
  assert.ok(isPurchasePaymentConfirmation("sí"));
  assert.ok(isPurchasePaymentConfirmation("si"));
  assert.ok(isPurchasePaymentConfirmation("ok"));
  assert.ok(isPurchasePaymentConfirmation("dale"));
  assert.ok(isPurchasePaymentConfirmation("generar link de pago"));
  assert.ok(isPurchasePaymentConfirmation("quiero pagar"));
  assert.ok(!isPurchasePaymentConfirmation("quiero comprar 5000 sms"));
  console.log("✓ isPurchasePaymentConfirmation");
}

function testHasActiveQuote(): void {
  assert.ok(
    hasActivePurchaseQuote({
      purchaseFlowStep: PURCHASE_FLOW_STEP.REVIEW_QUOTE,
      pendingPurchaseQuote: { quoted_quantity: 5000 } as never,
      pendingPurchaseQuantity: 5000,
    }),
  );
  assert.ok(!hasActivePurchaseQuote({ purchaseFlowStep: PURCHASE_FLOW_STEP.NEED_QUANTITY }));
  console.log("✓ hasActivePurchaseQuote");
}

function makeCtx(companyId: string, sessionId: string): AgentExecutionContext {
  return {
    channel: "web_client",
    companyId,
    userId: null,
    sessionId,
    metadata: {},
  };
}

async function seedQuote(
  companyId: string,
  sessionId: string,
  quantity: number,
): Promise<void> {
  const quote = await calculateTelvoiceQuote(quantity);
  await updateConversationMemory(
    sessionId,
    "web_client",
    {
      purchaseFlowStep: PURCHASE_FLOW_STEP.REVIEW_QUOTE,
      pendingPurchaseQuantity: quote.quoted_quantity,
      pendingPurchaseQuote: quote,
      lastQuote: quote,
      lastQuantity: quote.quoted_quantity,
    },
    companyId,
  );
}

async function runPurchaseMessage(
  companyId: string,
  sessionId: string,
  message: string,
): Promise<{ reply: string; paymentUrl?: string; orderId?: string }> {
  const memory = await getConversationMemory(sessionId, "web_client");
  const route = routeAgentIntent(message, "web_client", { memory });
  const ctx = makeCtx(companyId, sessionId);
  const res = await handleBuySmsFlow({
    message,
    ctx,
    sessionId,
    memory,
    route,
  });
  assert.ok(res, `handleBuySmsFlow null for «${message}»`);
  return {
    reply: res!.reply,
    paymentUrl: res!.paymentUrl,
    orderId: res!.orderId,
  };
}

async function testAffirmativeGeneratesLinkOrMpMessage(): Promise<void> {
  const companyId =
    process.env.TEST_COMPANY_ID?.trim() ?? "259eb2a3-47a1-4788-908b-9d8986f04027";
  const sessionId = randomUUID();
  await seedQuote(companyId, sessionId, 5000);

  for (const msg of ["sí", "generar link de pago", "ok"]) {
    const sid = randomUUID();
    await seedQuote(companyId, sid, 5000);
    const r = await runPurchaseMessage(companyId, sid, msg);
    assert.ok(
      !/cuántos sms quieres comprar/i.test(r.reply),
      `«${msg}» no debe pedir cantidad: ${r.reply.slice(0, 80)}`,
    );
    const okLink =
      /preparé tu compra|mercadopago|pagar aquí|pago con mercadopago no está disponible/i.test(
        r.reply,
      ) || Boolean(r.paymentUrl);
    assert.ok(okLink, `«${msg}» debe intentar link MP: ${r.reply.slice(0, 120)}`);
  }
  console.log("✓ cotización 5k + sí / link / ok");
}

async function test5000QuoteThenSi(): Promise<void> {
  const companyId =
    process.env.TEST_COMPANY_ID?.trim() ?? "259eb2a3-47a1-4788-908b-9d8986f04027";
  const sessionId = randomUUID();

  const q1 = await runPurchaseMessage(
    companyId,
    sessionId,
    "quiero comprar una bolsa de 5000 sms",
  );
  assert.match(q1.reply, /5\.?000/i);
  assert.match(q1.reply, /53\.?550/);
  assert.ok(hasActivePurchaseQuote(await getConversationMemory(sessionId, "web_client")));

  const q2 = await runPurchaseMessage(companyId, sessionId, "sí");
  assert.ok(
    !/cuántos sms quieres comprar/i.test(q2.reply),
    `sí tras cotizar no debe resetear: ${q2.reply.slice(0, 100)}`,
  );
  assert.ok(
    /preparé tu compra|mercadopago|pagar aquí|no está disponible/i.test(q2.reply) ||
      q2.paymentUrl,
    `debe ofrecer pago: ${q2.reply.slice(0, 120)}`,
  );

  const q3 = await runAgentCore({
    channel: "web_client",
    message: "sí",
    sessionId,
    companyId,
    userId: null,
  });
  assert.ok(
    !/cuántos sms quieres comprar/i.test(q3.reply),
    `agentCore sí con memoria: ${q3.reply.slice(0, 80)}`,
  );
  console.log("✓ compra 5k + sí");
}

async function test30000Ok(): Promise<void> {
  const companyId =
    process.env.TEST_COMPANY_ID?.trim() ?? "259eb2a3-47a1-4788-908b-9d8986f04027";
  const sessionId = randomUUID();
  await seedQuote(companyId, sessionId, 30_000);
  const r = await runPurchaseMessage(companyId, sessionId, "ok");
  assert.ok(!/cuántos sms/i.test(r.reply));
  assert.match(r.reply, /30\.?000|249\.?900|preparé|mercadopago|pagar/i);
  console.log("✓ 30k + ok");
}

async function testSiWithoutQuote(): Promise<void> {
  const companyId =
    process.env.TEST_COMPANY_ID?.trim() ?? "259eb2a3-47a1-4788-908b-9d8986f04027";
  const sessionId = randomUUID();
  const r = await runPurchaseMessage(companyId, sessionId, "sí");
  assert.match(r.reply, /cuántos sms|primero/i);
  assert.ok(!/preparé tu compra/i.test(r.reply));
  console.log("✓ sí sin cotización pide cantidad");
}

async function testDoubleAffirmativeNoDuplicateOrder(): Promise<void> {
  const companyId =
    process.env.TEST_COMPANY_ID?.trim() ?? "259eb2a3-47a1-4788-908b-9d8986f04027";
  const sessionId = randomUUID();
  await seedQuote(companyId, sessionId, 5000);
  const r1 = await runPurchaseMessage(companyId, sessionId, "sí");
  const order1 = r1.orderId;
  const r2 = await runPurchaseMessage(companyId, sessionId, "sí");
  if (order1 && r2.orderId) {
    assert.equal(r2.orderId, order1, "segunda afirmación reutiliza orden");
  }
  assert.ok(!/cuántos sms quieres comprar/i.test(r2.reply));
  console.log("✓ doble sí reutiliza link");
}

async function testChangeQuantityAndCancel(): Promise<void> {
  const companyId =
    process.env.TEST_COMPANY_ID?.trim() ?? "259eb2a3-47a1-4788-908b-9d8986f04027";
  const sessionId = randomUUID();
  await seedQuote(companyId, sessionId, 5000);

  const changed = await runPurchaseMessage(companyId, sessionId, "cambiar cantidad");
  assert.match(changed.reply, /cuántos sms/i);

  const memAfterChange = await getConversationMemory(sessionId, "web_client");
  assert.equal(memAfterChange.purchaseFlowStep, PURCHASE_FLOW_STEP.NEED_QUANTITY);

  const session2 = randomUUID();
  await seedQuote(companyId, session2, 5000);
  const cancelled = await runPurchaseMessage(companyId, session2, "cancelar compra");
  assert.match(cancelled.reply, /cancelé/i);
  const memCancel = await getConversationMemory(session2, "web_client");
  assert.equal(memCancel.purchaseFlowStep, undefined);
  assert.equal(memCancel.pendingPurchaseQuote, undefined);
  console.log("✓ cambiar cantidad y cancelar");
}

async function main(): Promise<void> {
  console.log("=== test:agent-purchase-flow ===\n");
  await testPricingTiers();
  testShortfallBag();
  testPurchaseIntent();
  testPaymentConfirmationHelper();
  testHasActiveQuote();
  await testAffirmativeGeneratesLinkOrMpMessage();
  await test30000Ok();
  await testSiWithoutQuote();
  await testDoubleAffirmativeNoDuplicateOrder();
  await testChangeQuantityAndCancel();
  await test5000QuoteThenSi();
  console.log("\nTodos los casos pasaron.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
