#!/usr/bin/env node
/**
 * QA: client_company_settings — upsert, read, validación, limpieza demo.
 */
import "dotenv/config";
import pg from "pg";
import {
  getCompanySettings,
  getCompanySettingsModuleState,
  upsertCompanySettings,
  validateClientSettings,
} from "../dist/services/clientCompanySettingsService.js";

const DEMO = process.env.QA_COMPANY_ID || "6cd1db92-d5c7-45e0-8548-df8907843350";
const MARKER = `qa-settings-${Date.now()}`;

const defaults = {
  activeTab: "empresa",
  company: {
    name: "QA Settings",
    rut: "",
    activity: "",
    website: "",
    country: "Chile",
    city: "",
    address: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
  },
  billing: {
    legalName: "",
    rut: "",
    address: "",
    email: "",
    country: "Chile",
    currency: "CLP",
    sendReceipts: true,
    sendInvoices: true,
    notifyPending: true,
    notifyCredited: true,
  },
  notifications: {
    purchaseStarted: true,
    paymentApproved: true,
    balanceCredited: true,
    paymentRejected: true,
    lowBalance: true,
    campaignFinished: true,
    massDeliveryError: true,
    dlrReports: true,
    apiKeyRegenerated: true,
    webhookErrors: true,
    rateLimit: true,
    ticketNewMessage: true,
    ticketResolved: true,
    ticketWaiting: true,
    lowBalanceThreshold: 50,
  },
  preferences: {
    language: "es",
    timezone: "America/Santiago",
    dateFormat: "DD/MM/YYYY",
    homePage: "dashboard",
    ticketView: "table",
    showQuickHelp: true,
    defaultSender: MARKER,
    defaultCountry: "Chile",
    phoneFormat: "e164",
    warnMultiSms: true,
    confirmMassSend: false,
  },
};

async function cleanup(conn, marker) {
  const { rowCount } = await conn.query(
    `DELETE FROM client_company_settings
     WHERE company_id = $1 AND sms_preferences->>'defaultSender' = $2`,
    [DEMO, marker],
  );
  return rowCount;
}

const module = await getCompanySettingsModuleState();
if (!module.available) {
  console.error("FAIL: módulo settings no disponible", module);
  process.exit(1);
}

try {
  validateClientSettings({
    ...defaults,
    company: { ...defaults.company, contactEmail: "bad" },
  });
  console.error("FAIL: validación email debió fallar");
  process.exit(1);
} catch {
  console.log("OK: validación email inválido");
}

const payload = { ...defaults };
payload.preferences.defaultSender = MARKER;

const saved = await upsertCompanySettings({
  companyId: DEMO,
  settings: payload,
});
if (!saved.ok) {
  console.error("FAIL upsert", saved);
  process.exit(1);
}
if (saved.data.preferences.defaultSender !== MARKER) {
  console.error("FAIL: sender no persistió", saved.data.preferences.defaultSender);
  process.exit(1);
}
console.log("OK: upsert");

const loaded = await getCompanySettings(DEMO, defaults);
if (!loaded.ok || !loaded.data.hasStoredRecord) {
  console.error("FAIL load", loaded);
  process.exit(1);
}
if (loaded.data.settings.preferences.defaultSender !== MARKER) {
  console.error("FAIL: read mismatch");
  process.exit(1);
}
console.log("OK: read");

const conn = process.env.DATABASE_URL
  ? new pg.Client({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("supabase")
        ? { rejectUnauthorized: false }
        : undefined,
    })
  : null;
if (conn) {
  await conn.connect();
  const removed = await cleanup(conn, MARKER);
  await conn.end();
  console.log("OK: limpieza QA demo (filas:", removed, ")");
}

console.log("\n✅ verify-client-settings-qa completado");
