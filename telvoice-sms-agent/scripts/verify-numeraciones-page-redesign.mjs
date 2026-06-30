#!/usr/bin/env node
/**
 * QA: render fixtures del rediseño /app/numeraciones + validación de rutas en HTML.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "..", "qa-evidence", "numeraciones-redesign", "fixtures");

const { renderAppNumeracionesPage } = await import(
  "../dist/views/app-ui/app-numeraciones-page.js"
);

const now = new Date();
const fourMinAgo = new Date(now.getTime() - 4 * 60_000).toISOString();

const mockCtx = {
  profile: {
    profileId: "p1",
    adminUserId: null,
    authUserId: "u1",
    companyId: "c1",
    email: "cliente@demo.cl",
    fullName: "Cliente Demo",
    role: "company_admin",
    status: "active",
    isInternal: false,
    fromDatabase: true,
  },
  company: {
    id: "c1",
    name: "Empresa Demo",
    legal_name: null,
    rut: null,
    billing_email: null,
    contact_name: null,
    contact_phone: null,
    country: "CL",
    status: "active",
    metadata: {},
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  },
  balance: {
    companyId: "c1",
    country: "CL",
    availableSms: 1250,
    reservedSms: 0,
    consumedSms: 500,
    totalPurchasedSms: 1750,
    status: "active",
    walletId: "w1",
  },
};

function baseNumber(overrides) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    company_id: "c1",
    number: "+56989273021",
    country_code: "CL",
    type: "sim_real",
    status: "active",
    provider: "telsim",
    sim_slot: null,
    gateway_id: null,
    capabilities: {
      receive_sms: true,
      send_sms: true,
      otp_authorized: true,
      api_webhook: true,
    },
    assigned_agent_id: "agent-1",
    activated_at: "2026-01-15T12:00:00.000Z",
    renewed_at: null,
    expires_at: "2027-01-15T12:00:00.000Z",
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    plan_code: "start",
    plan_label: "Start",
    has_agent: true,
    last_sms_at: fourMinAgo,
    last_sms_from: "+56912345678",
    ...overrides,
  };
}

const scenarios = {
  "desktop-with-plan": {
    numbers: [baseNumber({})],
  },
  "desktop-without-plan": {
    numbers: [
      baseNumber({
        id: "22222222-2222-4222-8222-222222222222",
        number: "+56981272867",
        plan_code: null,
        plan_label: "Sin plan",
        has_agent: false,
        assigned_agent_id: null,
        capabilities: {
          receive_sms: true,
          send_sms: false,
          otp_authorized: false,
          api_webhook: false,
        },
        last_sms_at: null,
        last_sms_from: null,
      }),
    ],
  },
  "desktop-overview-kpis": {
    numbers: [
      baseNumber({}),
      baseNumber({
        id: "33333333-3333-4333-8333-333333333333",
        number: "+56977109623",
        plan_code: null,
        plan_label: "Sin plan",
        has_agent: false,
        assigned_agent_id: null,
        capabilities: { receive_sms: true, send_sms: true, otp_authorized: true, api_webhook: false },
        last_sms_at: "2026-05-20T10:00:00.000Z",
        last_sms_from: "+56999998888",
      }),
    ],
  },
  "mobile-cards": {
    numbers: [baseNumber({}), baseNumber({
      id: "44444444-4444-4444-8444-444444444444",
      number: "+56934449937",
      plan_code: null,
      plan_label: "Sin plan",
      has_agent: false,
      assigned_agent_id: null,
      capabilities: { receive_sms: true, send_sms: false, otp_authorized: false, api_webhook: false },
      last_sms_at: null,
      last_sms_from: null,
    })],
  },
  "empty-state": {
    numbers: [],
  },
};

mkdirSync(outDir, { recursive: true });

const routeChecks = [];

for (const [name, data] of Object.entries(scenarios)) {
  const html = renderAppNumeracionesPage(mockCtx, {
    module: { available: true, migrationPending: false },
    numbers: data.numbers,
  });
  writeFileSync(path.join(outDir, `${name}.html`), html, "utf8");

  if (data.numbers.length === 0) {
    assert.match(html, /Todavía no tienes numeraciones contratadas/);
    assert.match(html, /href="\/app\/planes-agente\?action=request"/);
    assert.match(html, /href="\/app\/planes-agente"/);
  } else {
    const first = data.numbers[0];
    assert.match(html, /Mis numeraciones/);
    assert.match(html, /Numeraciones activas/);
    if (first.plan_code) {
      assert.match(html, /href="\/app\/sms-inbox\?number=/);
      assert.match(html, /href="\/app\/agente"/);
    } else {
      assert.match(html, /Activar plan/);
    }
    assert.match(html, new RegExp(`href="/app/numeraciones/${first.id}/integraciones"`));
  }

  routeChecks.push({ scenario: name, ok: true });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      fixtures_dir: outDir,
      scenarios: Object.keys(scenarios),
      route_checks: routeChecks,
    },
    null,
    2,
  ),
);
