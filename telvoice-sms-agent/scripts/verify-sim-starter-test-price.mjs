#!/usr/bin/env node
/**
 * Valida override de precio Starter de prueba (sin DB ni MercadoPago).
 * Uso: SIM_STARTER_TEST_PRICE_CLP=1000 SIM_STARTER_TEST_PRICE_EMAILS=victor@telvoice.net node scripts/verify-sim-starter-test-price.mjs
 */
import { SIM_PLANS } from "../dist/utils/simPlans.js";
import { resolveSimBundleCheckoutPricing } from "../dist/utils/simTestPricing.js";

const starter = SIM_PLANS.sim_starter;
const pro = SIM_PLANS.sim_pro;

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("OK:", msg);
}

const victorStarter = resolveSimBundleCheckoutPricing(starter, "victor@telvoice.net");
const victorPro = resolveSimBundleCheckoutPricing(pro, "victor@telvoice.net");
const randomStarter = resolveSimBundleCheckoutPricing(starter, "random@test.com");

assert(starter.total_amount === 29990, "Starter catálogo sigue 29990");
assert(pro.total_amount === 49990, "Pro catálogo sigue 49990");

const testPrice = Number(process.env.SIM_STARTER_TEST_PRICE_CLP || 0);
const testEmails = (process.env.SIM_STARTER_TEST_PRICE_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

if (testPrice > 0 && testEmails.includes("victor@telvoice.net")) {
  assert(victorStarter.totalAmount === testPrice, `victor@ starter checkout = ${testPrice}`);
  assert(victorStarter.priceMetadata.test_price_override === true, "metadata test_price_override");
  assert(randomStarter.totalAmount === 29990, "random@test.com starter = precio normal");
  assert(victorPro.totalAmount === 49990, "victor@ pro = precio normal");
} else {
  assert(victorStarter.totalAmount === 29990, "sin env override victor starter = 29990");
  console.log("SKIP: SIM_STARTER_TEST_PRICE_* no configurado — override desactivado");
}

console.log("\nverify-sim-starter-test-price: done");
