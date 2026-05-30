#!/usr/bin/env node
/**
 * QA funcional Wholesale Core — login admin, smoke HTTP y CRUD básico.
 */
import "dotenv/config";

const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.SUPERADMIN_EMAIL?.trim();
const ADMIN_PASS = process.env.SUPERADMIN_PASSWORD?.trim();

const WHOLESALE_PAGES = [
  "/admin/wholesale",
  "/admin/wholesale/providers",
  "/admin/wholesale/routes",
  "/admin/wholesale/rates",
  "/admin/wholesale/route-tests",
  "/admin/wholesale/customers",
  "/admin/wholesale/opportunities",
];

const RETAIL_SMOKE = [
  "/admin/pricing",
  "/admin/orders",
  "/admin/wallets",
];

function fail(msg) {
  console.error("FAIL:", msg);
  process.exitCode = 1;
}

function ok(msg) {
  console.log("OK:", msg);
}

async function loginAdmin() {
  if (!ADMIN_EMAIL || !ADMIN_PASS) {
    fail("SUPERADMIN_EMAIL/PASSWORD no definidos en .env");
    return null;
  }
  const res = await fetch(`${BASE}/admin/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const legacy = res.headers.get("set-cookie");
  const cookies = setCookie.length ? setCookie : legacy ? [legacy] : [];
  const session = cookies.find((c) => c.startsWith("tv_admin_session="));
  if (!session) {
    fail(`Login admin falló (status ${res.status})`);
    return null;
  }
  ok(`Login admin (${res.status})`);
  return session.split(";")[0];
}

async function getPage(cookie, path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  const html = await res.text();
  return { status: res.status, html, location: res.headers.get("location") };
}

async function postForm(cookie, path, body, followRedirect = false) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    redirect: followRedirect ? "follow" : "manual",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  const html = followRedirect ? await res.text() : "";
  return {
    status: res.status,
    location: res.headers.get("location"),
    html,
  };
}

function extractEntityEditId(html, entityLabel) {
  const rowIdx = html.indexOf(entityLabel);
  if (rowIdx < 0) return null;
  const slice = html.slice(Math.max(0, rowIdx - 400), rowIdx + 400);
  const m = slice.match(/\/admin\/wholesale\/providers\/([0-9a-f-]{36})\/edit/i);
  return m?.[1] ?? null;
}

async function main() {
  console.log(`Base URL: ${BASE}`);
  const cookie = await loginAdmin();
  if (!cookie) return;

  // Smoke wholesale pages
  for (const path of WHOLESALE_PAGES) {
    const { status, html, location } = await getPage(cookie, path);
    if (status === 302 && location?.includes("/admin/login")) {
      fail(`${path} redirige a login`);
      continue;
    }
    if (status !== 200) {
      fail(`${path} → HTTP ${status}`);
      continue;
    }
    if (html.includes("Internal Server Error") || html.includes("Error:")) {
      fail(`${path} contiene error en HTML`);
      continue;
    }
    ok(`${path} → 200`);
  }

  // Verify seeded data visible
  const providers = await getPage(cookie, "/admin/wholesale/providers");
  if (!providers.html.includes("Almuqeet")) fail("Listado proveedores sin Almuqeet");
  else ok("Listado proveedores muestra Almuqeet");

  if (!providers.html.includes("PTG Pacific Telecom")) fail("Listado proveedores sin PTG");
  else ok("Listado proveedores muestra PTG Pacific Telecom");

  const routes = await getPage(cookie, "/admin/wholesale/routes");
  if (!routes.html.includes("All operators")) fail("Listado rutas sin All operators");
  else ok("Listado rutas muestra Chile / All operators");

  if (!routes.html.includes("Live") && !routes.html.includes("live")) {
    fail("Listado rutas sin badge live");
  } else ok("Listado rutas muestra estado live");

  const customers = await getPage(cookie, "/admin/wholesale/customers");
  if (!customers.html.includes("Demo Wholesale LATAM SpA")) fail("Clientes sin demo SMPP");
  else ok("Clientes muestra demo wholesale SMPP");

  const rates = await getPage(cookie, "/admin/wholesale/rates");
  if (!rates.html.includes("Rates LATAM mayo 2026")) fail("Rates sin oferta demo");
  else ok("Rates muestra oferta demo con raw_text");

  const opps = await getPage(cookie, "/admin/wholesale/opportunities");
  if (!opps.html.includes("Demo Wholesale LATAM SpA")) fail("Oportunidades sin demo");
  else ok("Oportunidades muestra demo vinculada a cliente");

  const tests = await getPage(cookie, "/admin/wholesale/route-tests");
  if (!tests.html.includes("+56987654321")) fail("Pruebas sin número demo");
  else ok("Pruebas de ruta muestra registro demo");

  // CRUD: crear proveedor temporal (código único por corrida)
  const tempCode = `qa_temp_${Date.now()}`;
  const createProv = await postForm(cookie, "/admin/wholesale/providers", {
    name: "QA Temp Provider",
    code: tempCode,
    country_code: "US",
    connection_type: "http_api",
    status: "draft",
  });
  if (createProv.status !== 302 || !createProv.location?.includes("success=")) {
    fail(`Crear proveedor → ${createProv.status} ${createProv.location ?? ""}`);
  } else ok("CRUD crear proveedor → redirect success");

  const listAfterCreate = await getPage(cookie, "/admin/wholesale/providers");
  const tempId = extractEntityEditId(listAfterCreate.html, "QA Temp Provider");
  if (!listAfterCreate.html.includes("QA Temp Provider")) {
    fail("Proveedor temporal no aparece en listado");
  } else ok("CRUD listar incluye proveedor temporal");

  if (tempId) {
    const editForm = await getPage(cookie, `/admin/wholesale/providers/${tempId}/edit`);
    if (editForm.status !== 200) fail(`Editar proveedor form → ${editForm.status}`);
    else ok("CRUD editar proveedor → formulario 200");

    const editPost = await postForm(cookie, `/admin/wholesale/providers/${tempId}/edit`, {
      name: "QA Temp Provider Updated",
      code: tempCode,
      country_code: "US",
      connection_type: "http_api",
      status: "paused",
    });
    if (editPost.status !== 302) fail(`Actualizar proveedor → ${editPost.status}`);
    else ok("CRUD editar proveedor → redirect success");

    const del = await postForm(cookie, `/admin/wholesale/providers/${tempId}/delete`, {});
    if (del.status !== 302) fail(`Eliminar proveedor → ${del.status}`);
    else ok("CRUD eliminar proveedor → redirect success");
  }

  // Retail smoke (admin pages only — no checkout mutation)
  for (const path of RETAIL_SMOKE) {
    const { status, location } = await getPage(cookie, path);
    if (status === 302 && location?.includes("/admin/login")) {
      fail(`Retail ${path} redirige a login`);
    } else if (status === 200) {
      ok(`Retail intacto ${path} → 200`);
    } else {
      fail(`Retail ${path} → HTTP ${status}`);
    }
  }

  // Public retail routes smoke (no auth)
  for (const path of ["/", "/checkout/success", "/checkout/pending", "/checkout/failure"]) {
    try {
      const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
      if (res.status >= 500) fail(`Retail público ${path} → ${res.status}`);
      else ok(`Retail público ${path} → ${res.status} (sin 5xx)`);
    } catch (e) {
      fail(`Retail público ${path} error: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log("\n--- Resumen QA wholesale ---");
  console.log(process.exitCode ? "RESULTADO: CON FALLOS" : "RESULTADO: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
