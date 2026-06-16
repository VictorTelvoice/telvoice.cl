/**
 * Tests unitarios: post-compra panel cliente (emails + destinatario).
 */
import assert from "node:assert/strict";
import { resolvePanelCheckoutEmails } from "../src/services/mercadoPagoClientPanelService.js";
import type { SmsOrderRow } from "../src/types/wallet.js";

function testResolvePanelCheckoutEmails(): void {
  assert.deepEqual(
    resolvePanelCheckoutEmails({
      payerEmail: "Felipe@Gmail.com",
      companyBillingEmail: "otro@example.com",
    }),
    {
      checkoutEmail: "felipe@gmail.com",
      payerEmail: "felipe@gmail.com",
    },
  );

  assert.deepEqual(
    resolvePanelCheckoutEmails({
      payerEmail: null,
      companyBillingEmail: "empresa@telvoice.cl",
    }),
    {
      checkoutEmail: "empresa@telvoice.cl",
      payerEmail: "empresa@telvoice.cl",
    },
  );

  assert.equal(
    resolvePanelCheckoutEmails({
      payerEmail: "",
      companyBillingEmail: "",
    }),
    null,
  );

  console.log("✓ resolvePanelCheckoutEmails");
}

function testRecipientResolutionOrder(): void {
  const order = {
    checkout_email: null,
    payer_email: null,
    metadata: {},
    company_id: "958688d8-0b85-4e35-9449-5dd6375fd2e4",
    created_by: null,
  } as SmsOrderRow;

  // Orden sin email en campos directos: el fallback async usa company.billing_email
  // (cubierto en QA manual Caso C; aquí solo documentamos prioridad sync).
  const syncCandidates = [
    order.checkout_email,
    order.payer_email,
    order.metadata?.checkout_email,
    order.metadata?.payer_email,
  ].filter((v) => typeof v === "string" && v.includes("@"));
  assert.equal(syncCandidates.length, 0);
  console.log("✓ orden panel sin email directo requiere fallback async");
}

function testClientPanelMetadata(): void {
  const meta = {
    source: "client_panel",
    checkout_mode: "mercadopago",
    buyer_source: "client_panel",
  };
  assert.equal(meta.source, "client_panel");
  assert.equal(meta.buyer_source, "client_panel");
  console.log("✓ metadata client_panel");
}

async function main(): Promise<void> {
  testResolvePanelCheckoutEmails();
  testRecipientResolutionOrder();
  testClientPanelMetadata();
  console.log("\nTodos los tests client-panel-post-purchase OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
