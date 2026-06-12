#!/usr/bin/env node
/**
 * QA Fase 3 — inventario + checkout SIM (sin imprimir E.164 ni secrets).
 * Ejecutar: npx tsx scripts/verify-sim-inventory-fase3-qa.mjs
 */
import "dotenv/config";
import pg from "pg";
import { getPublicAvailability } from "../src/services/realNumberInventoryService.ts";
import {
  createPublicSimAgentBundleOrder,
  patchOrderFields,
} from "../src/services/smsOrderService.ts";
import {
  linkSimActivationInventory,
  markSimActivationPaidPending,
  createSimActivationRequest,
  activatePaidSimActivationRequest,
} from "../src/services/simActivationService.ts";
import {
  markNumberPaymentApproved,
  releaseReservationForOrder,
  reserveAvailableNumberForCheckout,
} from "../src/services/realNumberInventoryService.ts";
import { getSimPlan, getBundledAgentAddonForSimPlan } from "../src/utils/simPlans.ts";
import { getAgentAddon } from "../src/utils/agentAddons.ts";
import { provisionCompanyFromCheckout } from "../src/services/checkoutAccountProvisionService.ts";
import { createAgentPlanRequestFromCheckout } from "../src/services/clientAgentPlanService.ts";
import { markOrderPaid, getOrderById } from "../src/services/smsOrderService.ts";

const AGENT = (process.env.QA_AGENT_URL || process.env.PUBLIC_APP_URL || "http://localhost:3001").replace(/\/$/, "");
const cs = process.env.DATABASE_URL?.trim();
const PLANS = [
  { id: "sim_starter", agent: "agent_start", planCode: "start" },
  { id: "sim_pro", agent: "agent_pro", planCode: "pro" },
  { id: "sim_power", agent: "agent_business", planCode: "business" },
];

const report = { results: {}, errors: [] };
function pass(k, d) { report.results[k] = { ok: true, detail: d }; }
function fail(k, d) { report.results[k] = { ok: false, detail: d }; report.errors.push(`${k}: ${d}`); }

if (!cs) { console.error(JSON.stringify({ ok: false, error: "DATABASE_URL missing" })); process.exit(1); }

const pgClient = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

async function inventoryCounts() {
  const { rows } = await pgClient.query(
    `SELECT sales_status, COUNT(*)::int AS n FROM real_number_inventory GROUP BY sales_status ORDER BY 1`,
  );
  const map = Object.fromEntries(rows.map((r) => [r.sales_status, r.n]));
  map.total = rows.reduce((s, r) => s + r.n, 0);
  return map;
}

async function simulatePaidBundle(orderId, planId) {
  const plan = getSimPlan(planId);
  if (!plan) throw new Error("plan missing");
  const refreshed = await getOrderById(orderId);
  if (!refreshed) throw new Error("order missing");
  await markOrderPaid(orderId, null);
  const inventoryNumberId =
    refreshed.metadata?.inventory_number_id != null
      ? String(refreshed.metadata.inventory_number_id)
      : null;
  const activation = await createSimActivationRequest({
    orderId,
    plan,
    checkoutEmail: refreshed.checkout_email,
    payerName: String(refreshed.metadata?.payer_name ?? "QA"),
    activationStatus: "paid_pending_activation",
    inventoryNumberId: inventoryNumberId ?? undefined,
  });
  if (inventoryNumberId) {
    await markNumberPaymentApproved({ orderId, simActivationRequestId: activation.id });
    await linkSimActivationInventory(orderId, inventoryNumberId);
  }
  await markSimActivationPaidPending(orderId);
  const provision = await provisionCompanyFromCheckout({
    order: await getOrderById(orderId),
    checkoutEmail: refreshed.checkout_email,
    payerName: String(refreshed.metadata?.payer_name ?? "QA"),
  });
  const bundledAgentId = getBundledAgentAddonForSimPlan(plan.plan_id);
  const addon = getAgentAddon(bundledAgentId);
  if (addon?.planCode) {
    await createAgentPlanRequestFromCheckout({
      companyId: provision.companyId,
      orderId,
      planCode: addon.planCode,
      checkoutEmail: refreshed.checkout_email,
    });
  }
  return { activationId: activation.id, companyId: provision.companyId, inventoryNumberId, bundledAgentId };
}

async function checkoutPlanViaServices(plan) {
  const simPlan = getSimPlan(plan.id);
  if (!simPlan) throw new Error("invalid plan");
  const email = `qa.fase3.${plan.id}.${Date.now()}@telvoice.test`;
  const { order } = await createPublicSimAgentBundleOrder({
    plan: simPlan,
    agentAddonId: plan.agent,
    checkoutEmail: email,
    payerName: "QA Fase3",
  });
  const reserved = await reserveAvailableNumberForCheckout({ orderId: order.id });
  await linkSimActivationInventory(order.id, reserved.id);
  await patchOrderFields(order.id, {
    metadata: {
      ...(order.metadata ?? {}),
      inventory_number_id: reserved.id,
      agent_addon_id: plan.agent,
    },
  });

  const { rows: inv } = await pgClient.query(
    `SELECT sales_status, reserved_until, current_order_id FROM real_number_inventory WHERE id = $1`,
    [reserved.id],
  );
  const mins = inv[0]?.reserved_until
    ? Math.round((new Date(inv[0].reserved_until).getTime() - Date.now()) / 60000)
    : null;
  if (inv[0]?.sales_status !== "reserved_pending_payment") throw new Error("not reserved");
  if (mins == null || mins < 20 || mins > 35) throw new Error(`reserved ~30m, got ${mins}m`);

  const paid = await simulatePaidBundle(order.id, plan.id);
  const { rows: ord } = await pgClient.query(
    `SELECT payment_status, credit_status FROM sms_orders WHERE id = $1`,
    [order.id],
  );
  const { rows: wtx } = await pgClient.query(
    `SELECT COUNT(*)::int n FROM wallet_transactions WHERE reference_type = 'sms_order' AND reference_id = $1 AND type = 'purchase_credit'`,
    [order.id],
  );
  const { rows: inv2 } = await pgClient.query(
    `SELECT sales_status FROM real_number_inventory WHERE id = $1`,
    [reserved.id],
  );
  const { rows: sim } = await pgClient.query(
    `SELECT activation_status, inventory_number_id FROM sim_activation_requests WHERE order_id = $1`,
    [order.id],
  );
  const { rows: ag } = await pgClient.query(
    `SELECT status, plan_code FROM agent_plan_requests WHERE order_id = $1`,
    [order.id],
  );
  if (ord[0]?.payment_status !== "paid") throw new Error("not paid");
  if (ord[0]?.credit_status === "credited" || wtx[0]?.n > 0) throw new Error("wallet credited");
  if (inv2[0]?.sales_status !== "sold_pending_activation") throw new Error("inventory status");
  if (sim[0]?.activation_status !== "paid_pending_activation") throw new Error("sim status");
  if (!sim[0]?.inventory_number_id) throw new Error("no inventory on sim");
  if (ag[0]?.status !== "paid_pending_setup") throw new Error("agent status");
  if (ag[0]?.plan_code !== plan.planCode) throw new Error("agent plan_code");
  if (paid.bundledAgentId !== plan.agent) throw new Error("agent map");

  return paid;
}

await pgClient.connect();
try {
  const counts = await inventoryCounts();
  report.inventory = counts;
  if (counts.total >= 17 && counts.connected_available >= 3) {
    pass("inventory_counts", `total=${counts.total} connected=${counts.connected_available} pre=${counts.preconfigured_pending ?? 0}`);
  } else fail("inventory_counts", JSON.stringify(counts));

  const avail = await getPublicAvailability();
  report.availability_service = avail;
  if (avail.in_stock && avail.available >= 3) pass("availability_service", `available=${avail.available}`);
  else fail("availability_service", JSON.stringify(avail));

  try {
    const res = await fetch(`${AGENT}/api/public/sim-availability`);
    const body = await res.json().catch(() => ({}));
    report.availability_api = { route: `${AGENT}/api/public/sim-availability`, status: res.status, body };
    if (res.ok && body.in_stock === true) pass("availability_api", `available=${body.available}`);
    else fail("availability_api", `status=${res.status}`);
  } catch (e) {
    fail("availability_api", e instanceof Error ? e.message : String(e));
  }

  let lastPaid = null;
  for (const plan of PLANS) {
    try {
      lastPaid = await checkoutPlanViaServices(plan);
      pass(`checkout_${plan.id}`, `reserved+paid simulated, agent=${plan.agent}`);
    } catch (e) {
      fail(`checkout_${plan.id}`, e instanceof Error ? e.message : String(e));
    }
  }

  await pgClient.query(
    `UPDATE real_number_inventory SET sales_status='not_for_sale', current_order_id=NULL, reserved_until=NULL
     WHERE sales_status='connected_available'`,
  );
  try {
    await reserveAvailableNumberForCheckout({ orderId: "00000000-0000-4000-8000-000000000099" });
    fail("stock_agotado", "reserve should have thrown");
  } catch (e) {
    if (e?.code === "NO_STOCK" || e?.statusCode === 409) pass("stock_agotado", "NO_STOCK on empty connected pool");
    else fail("stock_agotado", e instanceof Error ? e.message : String(e));
  }
  try {
    const res = await fetch(`${AGENT}/api/public/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_type: "sim_agent_bundle",
        sim_plan_id: "sim_starter",
        checkout_email: `qa.nostock.${Date.now()}@telvoice.test`,
        payer_name: "QA",
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 409 && body.code === "no_stock") pass("stock_agotado_api", "409 no_stock");
    else fail("stock_agotado_api", JSON.stringify({ status: res.status, body }));
  } catch (e) {
    fail("stock_agotado_api", e instanceof Error ? e.message : String(e));
  }
  await pgClient.query(
    `UPDATE real_number_inventory SET sales_status='connected_available', current_order_id=NULL, reserved_until=NULL
     WHERE sales_status='not_for_sale' AND webhook_connected=true AND connection_status='connected'`,
  );
  report.inventory_after_restore = await inventoryCounts();

  if (lastPaid?.activationId) {
    try {
      await activatePaidSimActivationRequest(lastPaid.activationId);
      const { rows: inv } = await pgClient.query(
        `SELECT sales_status, current_company_id, current_client_number_id FROM real_number_inventory WHERE id=$1`,
        [lastPaid.inventoryNumberId],
      );
      const { rows: sim } = await pgClient.query(
        `SELECT activation_status, client_number_id FROM sim_activation_requests WHERE id=$1`,
        [lastPaid.activationId],
      );
      const { rows: sub } = await pgClient.query(
        `SELECT status, included_number_id FROM agent_plan_subscriptions WHERE company_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [lastPaid.companyId],
      );
      const { rows: cn } = await pgClient.query(
        `SELECT status, company_id FROM client_numbers WHERE id=$1`,
        [sim[0]?.client_number_id],
      );
      if (
        inv[0]?.sales_status === "active_assigned" &&
        sim[0]?.activation_status === "active" &&
        sub[0]?.status === "active" &&
        cn[0]?.company_id === lastPaid.companyId
      ) {
        pass("admin_activation", "active_assigned + sim active + agent sub");
        pass("panel_client_data", `company_id set, client_number active, plan_code=${PLANS[2].planCode}`);
      } else {
        fail("admin_activation", JSON.stringify({ inv: inv[0], sim: sim[0], sub: sub[0], cn: cn[0] }));
      }
    } catch (e) {
      fail("admin_activation", e instanceof Error ? e.message : String(e));
    }
  } else fail("admin_activation", "no checkout success to activate");

  const mp = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (mp) {
    const res = await fetch(`${AGENT}/api/public/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        package_id: "204786a5-0e70-43d4-8339-8403ccf810c4",
        checkout_email: `qa.bag.${Date.now()}@telvoice.test`,
        payer_name: "QA Bag",
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 201 && body.success) pass("sms_bag_regression", "landing bag checkout 201");
    else fail("sms_bag_regression", JSON.stringify(body));
  } else {
    report.results.sms_bag_regression = { ok: null, detail: "skipped — MERCADOPAGO_ACCESS_TOKEN unset in .env" };
  }

  report.ok = report.errors.length === 0;
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
} finally {
  await pgClient.end();
}
