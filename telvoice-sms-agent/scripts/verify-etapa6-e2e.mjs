#!/usr/bin/env node
/**
 * Verificación E2E Etapa 6 contra agent.telvoice.cl (o BASE_URL en .env).
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const BASE = (process.env.PUBLIC_APP_URL || "https://agent.telvoice.cl").replace(
  /\/$/,
  "",
);
const EMAIL = process.env.SUPERADMIN_EMAIL?.trim();
const PASS = process.env.SUPERADMIN_PASSWORD?.trim();
const COMPANY_ID =
  process.env.E2E_COMPANY_ID || "6cd1db92-d5c7-45e0-8548-df8907843350";

const results = [];
function ok(id, detail) {
  results.push({ id, pass: true, detail });
  console.log(`✓ ${id}: ${detail}`);
}
function fail(id, detail) {
  results.push({ id, pass: false, detail });
  console.error(`✗ ${id}: ${detail}`);
}

function parseCookies(res) {
  const raw =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean);
  return raw
    .flatMap((c) => (Array.isArray(c) ? c : [c]))
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function fetchAdmin(path, opts = {}) {
  const headers = { ...(opts.headers || {}), Cookie: cookie };
  const res = await fetch(`${BASE}${path}`, { ...opts, headers, redirect: "manual" });
  const loc = res.headers.get("location");
  if (res.status >= 300 && res.status < 400 && loc?.includes("/admin/login")) {
    throw new Error(`Sesión inválida en ${path} → ${loc}`);
  }
  const text = await res.text();
  return { res, text, status: res.status };
}

let cookie = "";

async function main() {
  if (!EMAIL || !PASS) {
    console.error("Faltan SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD en .env");
    process.exit(1);
  }

  const loginRes = await fetch(`${BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: EMAIL, password: PASS }),
    redirect: "manual",
  });
  cookie = parseCookies(loginRes);
  if (!cookie.includes("tv_admin_session")) {
    fail("login", `HTTP ${loginRes.status}, sin cookie`);
    printSummary();
    process.exit(1);
  }
  ok("login", `HTTP ${loginRes.status}`);

  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  // 1-2 pricing page
  const { text: pricingHtml } = await fetchAdmin("/admin/pricing");
  const hasMock = pricingHtml.includes("Datos de ejemplo");
  const hasMigration = pricingHtml.includes("Migración 011 pendiente");
  const { data: dbPkgs } = await sb
    .from("sms_packages")
    .select("id, name")
    .order("sort_order");
  const pkgNames = (dbPkgs ?? []).map((p) => p.name);
  const allNamesVisible = pkgNames.every((n) => pricingHtml.includes(n));

  if (hasMock || hasMigration) {
    fail("1-pricing-no-mock", `mock=${hasMock} migration=${hasMigration}`);
  } else {
    ok("1-pricing-no-mock", "Sin mock ni aviso migración");
  }
  if (allNamesVisible && pkgNames.length > 0) {
    ok("2-real-packages", `${pkgNames.length} bolsas visibles en HTML`);
  } else {
    fail("2-real-packages", `visible=${allNamesVisible} count=${pkgNames.length}`);
  }

  // 3 create package
  const newName = `Bolsa QA E2E ${Date.now()}`;
  const createRes = await fetchAdmin("/admin/pricing", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      name: newName,
      country: "CL",
      sms_quantity: "2500",
      total_price: "27500",
      unit_price: "11",
      currency: "CLP",
      package_type: "prepaid",
      sort_order: "99",
      is_active: "1",
    }),
  });
  if (createRes.status === 302 && createRes.res.headers.get("location")?.includes("ok=")) {
    ok("3-create-package", newName);
  } else {
    fail("3-create-package", `status=${createRes.status} loc=${createRes.res.headers.get("location")}`);
  }

  const { data: createdPkg } = await sb
    .from("sms_packages")
    .select("id, name, sms_quantity, is_active")
    .eq("name", newName)
    .maybeSingle();

  if (!createdPkg) {
    fail("3b-create-db", "No encontrada en DB");
  }

  // 4 edit package
  const editName = `${newName} (editada)`;
  if (createdPkg?.id) {
    const editRes = await fetchAdmin(`/admin/pricing/${createdPkg.id}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        name: editName,
        country: "CL",
        sms_quantity: "3000",
        total_price: "30000",
        unit_price: "10",
        currency: "CLP",
        package_type: "prepaid",
        sort_order: "99",
        is_active: "1",
      }),
    });
    const { data: edited } = await sb
      .from("sms_packages")
      .select("name, sms_quantity, total_price")
      .eq("id", createdPkg.id)
      .single();
    if (editRes.status === 302 && edited?.name === editName && edited.sms_quantity === 3000) {
      ok("4-edit-package", editName);
    } else {
      fail("4-edit-package", JSON.stringify(edited));
    }

    // 5 toggle off
    const toggleRes = await fetchAdmin(`/admin/pricing/${createdPkg.id}/toggle`, {
      method: "POST",
    });
    const { data: toggled } = await sb
      .from("sms_packages")
      .select("is_active")
      .eq("id", createdPkg.id)
      .single();
    if (toggleRes.status === 302 && toggled?.is_active === false) {
      ok("5-toggle-package", "Desactivada");
    } else {
      fail("5-toggle-package", `active=${toggled?.is_active}`);
    }
    await fetchAdmin(`/admin/pricing/${createdPkg.id}/toggle`, { method: "POST" });
  }

  // 6 wallets list
  const { text: walletsHtml } = await fetchAdmin("/admin/wallets");
  if (walletsHtml.includes("Empresa Demo Telvoice")) {
    ok("6-wallets-company", "Empresa demo en listado");
  } else {
    fail("6-wallets-company", "No aparece Empresa Demo Telvoice");
  }

  // 7 wallet detail (getOrCreate on credit)
  const { text: walletDetail } = await fetchAdmin(`/admin/wallets/${COMPANY_ID}`);
  if (walletDetail.includes("Disponible") && walletDetail.includes("Empresa Demo")) {
    ok("7-wallet-detail", "Detalle carga");
  } else {
    fail("7-wallet-detail", `len=${walletDetail.length}`);
  }

  const { data: walletBefore } = await sb
    .from("company_sms_wallets")
    .select("id, available_sms")
    .eq("company_id", COMPANY_ID)
    .maybeSingle();

  // 8 manual credit
  const creditRes = await fetchAdmin(`/admin/wallets/${COMPANY_ID}/credit`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      sms_amount: "500",
      description: "QA E2E credit",
    }),
  });
  const { data: walletAfterCredit } = await sb
    .from("company_sms_wallets")
    .select("id, available_sms")
    .eq("company_id", COMPANY_ID)
    .single();
  const expectedCredit =
    (walletBefore?.available_sms ?? 0) + 500;
  if (
    creditRes.status === 302 &&
    walletAfterCredit &&
    walletAfterCredit.available_sms === expectedCredit
  ) {
    ok("8-manual-credit", `available=${walletAfterCredit.available_sms}`);
  } else {
    fail(
      "8-manual-credit",
      `expected=${expectedCredit} got=${walletAfterCredit?.available_sms}`,
    );
  }

  // 9 manual debit
  const debitRes = await fetchAdmin(`/admin/wallets/${COMPANY_ID}/debit`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      sms_amount: "100",
      description: "QA E2E debit",
    }),
  });
  const { data: walletAfterDebit } = await sb
    .from("company_sms_wallets")
    .select("available_sms")
    .eq("company_id", COMPANY_ID)
    .single();
  if (
    debitRes.status === 302 &&
    walletAfterDebit?.available_sms === expectedCredit - 100
  ) {
    ok("9-manual-debit", `available=${walletAfterDebit.available_sms}`);
  } else {
    fail("9-manual-debit", `got=${walletAfterDebit?.available_sms}`);
  }

  // 10 transactions
  const { data: txs } = await sb
    .from("wallet_transactions")
    .select("type, sms_amount, description")
    .eq("company_id", COMPANY_ID)
    .order("created_at", { ascending: false });
  const types = new Set((txs ?? []).map((t) => t.type));
  if (types.has("manual_credit") && types.has("manual_debit")) {
    ok("10-transactions", `${txs?.length} movimientos (${[...types].join(", ")})`);
  } else {
    fail("10-transactions", `types=${[...types].join(",")} count=${txs?.length}`);
  }

  // 11 create order - use first active package from seed
  const { data: activePkg } = await sb
    .from("sms_packages")
    .select("id, name, sms_quantity")
    .eq("is_active", true)
    .order("sort_order")
    .limit(1)
    .single();

  const orderCreate = await fetchAdmin("/admin/orders", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      company_id: COMPANY_ID,
      package_id: activePkg.id,
      payment_reference: "QA-E2E-001",
    }),
  });
  const { data: lastOrder } = await sb
    .from("sms_orders")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (orderCreate.status === 302 && lastOrder?.payment_status === "pending") {
    ok("11-create-order", `order=${lastOrder.id.slice(0, 8)} qty=${lastOrder.sms_quantity}`);
  } else {
    fail("11-create-order", lastOrder?.payment_status);
  }

  const orderId = lastOrder?.id;
  const balanceBeforeOrderCredit = walletAfterDebit?.available_sms ?? 0;

  // 12 mark paid
  const paidRes = await fetchAdmin(`/admin/orders/${orderId}/mark-paid`, {
    method: "POST",
  });
  const { data: paidOrder } = await sb
    .from("sms_orders")
    .select("payment_status")
    .eq("id", orderId)
    .single();
  if (paidRes.status === 302 && paidOrder?.payment_status === "paid") {
    ok("12-mark-paid", "paid");
  } else {
    fail("12-mark-paid", paidOrder?.payment_status);
  }

  // 13 credit order
  const creditOrderRes = await fetchAdmin(`/admin/orders/${orderId}/credit`, {
    method: "POST",
  });
  const { data: creditedOrder } = await sb
    .from("sms_orders")
    .select("credit_status, sms_quantity")
    .eq("id", orderId)
    .single();
  const { data: walletAfterOrderCredit } = await sb
    .from("company_sms_wallets")
    .select("available_sms, total_purchased_sms")
    .eq("company_id", COMPANY_ID)
    .single();
  const expectedAfterCredit =
    balanceBeforeOrderCredit + (creditedOrder?.sms_quantity ?? 0);
  if (
    creditOrderRes.status === 302 &&
    creditedOrder?.credit_status === "credited" &&
    walletAfterOrderCredit?.available_sms === expectedAfterCredit
  ) {
    ok("13-credit-order", `+${creditedOrder.sms_quantity} SMS → ${walletAfterOrderCredit.available_sms}`);
  } else {
    fail(
      "13-credit-order",
      `credit=${creditedOrder?.credit_status} bal=${walletAfterOrderCredit?.available_sms} expected=${expectedAfterCredit}`,
    );
  }

  // 14 double credit
  const doubleRes = await fetchAdmin(`/admin/orders/${orderId}/credit`, {
    method: "POST",
  });
  const { data: walletAfterDouble } = await sb
    .from("company_sms_wallets")
    .select("available_sms")
    .eq("company_id", COMPANY_ID)
    .single();
  const { count: purchaseTxCount } = await sb
    .from("wallet_transactions")
    .select("id", { count: "exact", head: true })
    .eq("reference_id", orderId)
    .eq("type", "purchase_credit");
  if (
    walletAfterDouble?.available_sms === expectedAfterCredit &&
    purchaseTxCount === 1
  ) {
    ok("14-no-double-credit", `saldo estable, 1 tx purchase_credit`);
  } else {
    fail(
      "14-no-double-credit",
      `bal=${walletAfterDouble?.available_sms} txCount=${purchaseTxCount}`,
    );
  }

  // 15 dashboard KPIs
  const { text: dashHtml } = await fetchAdmin("/admin");
  const hasWalletKpi =
    dashHtml.includes("Comprado") ||
    dashHtml.includes("consumido") ||
    dashHtml.includes("wallet") ||
    dashHtml.includes("SMS");
  const noMockDash = !dashHtml.includes("tv-mock-tag") || dashHtml.includes("walletStats");
  if (dashHtml.length > 30000 && hasWalletKpi) {
    ok("15-dashboard-kpis", `HTML ${dashHtml.length}b con métricas`);
  } else {
    fail("15-dashboard-kpis", `len=${dashHtml.length} kpi=${hasWalletKpi}`);
  }

  // Cleanup QA package optional - leave for user to see or delete
  printSummary();
  process.exit(results.some((r) => !r.pass) ? 1 : 0);
}

function printSummary() {
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n--- ${passed}/${results.length} pruebas OK ---`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
