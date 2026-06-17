#!/usr/bin/env node
/**
 * Crea checkout sim_subscription real controlado (API productiva).
 * No envía amount desde cliente. Detiene tras entregar link MP.
 */
const AGENT = process.env.AGENT_BASE_URL || "https://agent.telvoice.cl";
const EMAIL = process.env.CHECKOUT_EMAIL || "licantravel@gmail.com";
const INVENTORY_PUB =
  process.env.INVENTORY_PUBLIC_ID || process.argv[2] || "pub_pG5mSxegmCL8";

async function main() {
  const nums = await fetch(`${AGENT}/api/public/sim-available-numbers?limit=5`).then(
    (r) => r.json(),
  );
  const target = (nums.numbers ?? []).find((n) => n.inventory_public_id === INVENTORY_PUB);
  if (!target) {
    console.error("Numeración no disponible en listado público para pub_id dado.");
    process.exit(1);
  }

  const payload = {
    product_type: "sim_subscription",
    plan_id: "sim_starter",
    billing_mode: "subscription",
    recurring: true,
    checkout_email: EMAIL,
    payer_name: "Licantravel",
    company_name: "Licantravel",
    inventory_public_id: INVENTORY_PUB,
  };

  const res = await fetch(`${AGENT}/api/public/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));

  if (!res.ok || !body.success) {
    console.error("Checkout falló:", res.status, JSON.stringify(body, null, 2));
    process.exit(1);
  }

  const ref = body.public_checkout_reference;
  const url = body.checkout_url;
  if (!url || String(url).includes("[object Object]")) {
    console.error("checkout_url inválido:", url);
    process.exit(1);
  }

  console.log("=== Checkout sim_subscription creado ===");
  console.log("product_type:", body.product_type);
  console.log("public_reference:", ref);
  console.log("order_id:", body.order_id);
  console.log("preapproval_id:", body.preapproval_id ?? body.preference_id);
  console.log("inventory_public_id:", INVENTORY_PUB);
  console.log("suffix:", target.suffix ? `***${target.suffix}` : "—");
  console.log("\nLink MercadoPago (pago manual Víctor):");
  console.log(url);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
