import { getSupabase } from "../database/supabaseClient.js";
import type {
  BillingSettingsData,
  ClientCompanySettingsInput,
  ClientCompanySettingsPayload,
  ClientCompanySettingsRow,
  ClientSettingsData,
  CompanySettingsData,
  CompanySettingsModuleState,
  CompanySettingsServiceResult,
  NotificationSettings,
  PanelPreferences,
  SmsPreferences,
} from "../types/client-settings.js";
import { isMissingTableError } from "../utils/db-table.js";
import { AppError } from "../utils/errors.js";
import { wrapSupabaseError } from "../utils/supabase-errors.js";

function asObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && !Number.isNaN(v) ? v : fallback;
}

export function uiSettingsToPayload(
  settings: ClientSettingsData,
): ClientCompanySettingsPayload {
  return {
    company_data: {
      companyName: settings.company.name,
      companyRut: settings.company.rut,
      businessActivity: settings.company.activity,
      website: settings.company.website,
      country: settings.company.country,
      city: settings.company.city,
      commercialAddress: settings.company.address,
      mainContactName: settings.company.contactName,
      contactEmail: settings.company.contactEmail,
      contactPhone: settings.company.contactPhone,
    },
    billing_data: {
      legalName: settings.billing.legalName,
      billingRut: settings.billing.rut,
      taxAddress: settings.billing.address,
      billingEmail: settings.billing.email,
      billingCountry: settings.billing.country,
      preferredCurrency: settings.billing.currency,
      sendReceiptsByEmail: settings.billing.sendReceipts,
      sendTaxDocumentWhenApplicable: settings.billing.sendInvoices,
      notifyPendingPayments: settings.billing.notifyPending,
      notifyAccreditedPurchases: settings.billing.notifyCredited,
    },
    notification_settings: {
      purchaseStarted: settings.notifications.purchaseStarted,
      paymentApproved: settings.notifications.paymentApproved,
      balanceAccredited: settings.notifications.balanceCredited,
      paymentRejected: settings.notifications.paymentRejected,
      lowBalance: settings.notifications.lowBalance,
      campaignCompleted: settings.notifications.campaignFinished,
      massiveDeliveryError: settings.notifications.massDeliveryError,
      deliveryReportsAvailable: settings.notifications.dlrReports,
      apiKeyRegenerated: settings.notifications.apiKeyRegenerated,
      webhookErrors: settings.notifications.webhookErrors,
      requestLimitReached: settings.notifications.rateLimit,
      newTicketMessage: settings.notifications.ticketNewMessage,
      ticketResolved: settings.notifications.ticketResolved,
      ticketWaitingResponse: settings.notifications.ticketWaiting,
      lowBalanceThreshold: settings.notifications.lowBalanceThreshold,
    },
    panel_preferences: {
      language: settings.preferences.language,
      timezone: settings.preferences.timezone,
      dateFormat: settings.preferences.dateFormat,
      initialPage: settings.preferences.homePage,
      preferredTicketView: settings.preferences.ticketView,
      showQuickHelp: settings.preferences.showQuickHelp,
    },
    sms_preferences: {
      defaultSender: settings.preferences.defaultSender,
      defaultCountry: settings.preferences.defaultCountry,
      preferredNumberFormat: settings.preferences.phoneFormat,
      warnIfMessageExceedsOneSms: settings.preferences.warnMultiSms,
      confirmBeforeMassiveSend: settings.preferences.confirmMassSend,
    },
    metadata: { activeTab: settings.activeTab },
  };
}

export function mergeSettingsFromStorage(
  base: ClientSettingsData,
  row: ClientCompanySettingsRow | null,
): ClientSettingsData {
  if (!row) {
    return structuredClone(base);
  }

  const co = asObject(row.company_data) as CompanySettingsData;
  const bl = asObject(row.billing_data) as BillingSettingsData;
  const nt = asObject(row.notification_settings) as NotificationSettings;
  const pp = asObject(row.panel_preferences) as PanelPreferences;
  const sp = asObject(row.sms_preferences) as SmsPreferences;
  const meta = asObject(row.metadata);

  const merged: ClientSettingsData = {
    activeTab: str(meta.activeTab, base.activeTab),
    company: {
      name: str(co.companyName, base.company.name),
      rut: str(co.companyRut, base.company.rut),
      activity: str(co.businessActivity, base.company.activity),
      website: str(co.website, base.company.website),
      country: str(co.country, base.company.country),
      city: str(co.city, base.company.city),
      address: str(co.commercialAddress, base.company.address),
      contactName: str(co.mainContactName, base.company.contactName),
      contactEmail: str(co.contactEmail, base.company.contactEmail),
      contactPhone: str(co.contactPhone, base.company.contactPhone),
    },
    billing: {
      legalName: str(bl.legalName, base.billing.legalName),
      rut: str(bl.billingRut, base.billing.rut),
      address: str(bl.taxAddress, base.billing.address),
      email: str(bl.billingEmail, base.billing.email),
      country: str(bl.billingCountry, base.billing.country),
      currency: str(bl.preferredCurrency, base.billing.currency),
      sendReceipts: bool(bl.sendReceiptsByEmail, base.billing.sendReceipts),
      sendInvoices: bool(
        bl.sendTaxDocumentWhenApplicable,
        base.billing.sendInvoices,
      ),
      notifyPending: bool(bl.notifyPendingPayments, base.billing.notifyPending),
      notifyCredited: bool(
        bl.notifyAccreditedPurchases,
        base.billing.notifyCredited,
      ),
    },
    notifications: {
      purchaseStarted: bool(nt.purchaseStarted, base.notifications.purchaseStarted),
      paymentApproved: bool(nt.paymentApproved, base.notifications.paymentApproved),
      balanceCredited: bool(nt.balanceAccredited, base.notifications.balanceCredited),
      paymentRejected: bool(nt.paymentRejected, base.notifications.paymentRejected),
      lowBalance: bool(nt.lowBalance, base.notifications.lowBalance),
      campaignFinished: bool(nt.campaignCompleted, base.notifications.campaignFinished),
      massDeliveryError: bool(
        nt.massiveDeliveryError,
        base.notifications.massDeliveryError,
      ),
      dlrReports: bool(nt.deliveryReportsAvailable, base.notifications.dlrReports),
      apiKeyRegenerated: bool(
        nt.apiKeyRegenerated,
        base.notifications.apiKeyRegenerated,
      ),
      webhookErrors: bool(nt.webhookErrors, base.notifications.webhookErrors),
      rateLimit: bool(nt.requestLimitReached, base.notifications.rateLimit),
      ticketNewMessage: bool(nt.newTicketMessage, base.notifications.ticketNewMessage),
      ticketResolved: bool(nt.ticketResolved, base.notifications.ticketResolved),
      ticketWaiting: bool(
        nt.ticketWaitingResponse,
        base.notifications.ticketWaiting,
      ),
      lowBalanceThreshold: num(
        nt.lowBalanceThreshold,
        base.notifications.lowBalanceThreshold,
      ),
    },
    preferences: {
      language: str(pp.language, base.preferences.language),
      timezone: str(pp.timezone, base.preferences.timezone),
      dateFormat: str(pp.dateFormat, base.preferences.dateFormat),
      homePage: str(pp.initialPage, base.preferences.homePage),
      ticketView: str(pp.preferredTicketView, base.preferences.ticketView),
      showQuickHelp: bool(pp.showQuickHelp, base.preferences.showQuickHelp),
      defaultSender: str(sp.defaultSender, base.preferences.defaultSender),
      defaultCountry: str(sp.defaultCountry, base.preferences.defaultCountry),
      phoneFormat: str(sp.preferredNumberFormat, base.preferences.phoneFormat),
      warnMultiSms: bool(
        sp.warnIfMessageExceedsOneSms,
        base.preferences.warnMultiSms,
      ),
      confirmMassSend: bool(
        sp.confirmBeforeMassiveSend,
        base.preferences.confirmMassSend,
      ),
    },
  };

  return merged;
}

export async function getCompanySettingsModuleState(): Promise<CompanySettingsModuleState> {
  const { error } = await getSupabase()
    .from("client_company_settings")
    .select("id")
    .limit(1);

  if (error && isMissingTableError(error)) {
    return { available: false, migrationPending: true };
  }
  if (error) {
    console.warn("[client-settings] getCompanySettingsModuleState", error);
    return { available: false, migrationPending: false };
  }
  return { available: true, migrationPending: false };
}

async function fetchSettingsRow(
  companyId: string,
): Promise<ClientCompanySettingsRow | null> {
  const { data, error } = await getSupabase()
    .from("client_company_settings")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    wrapSupabaseError(error, "fetchSettingsRow");
  }
  return (data as ClientCompanySettingsRow | null) ?? null;
}

export async function getCompanySettings(
  companyId: string,
  defaults: ClientSettingsData,
): Promise<
  CompanySettingsServiceResult<{
    settings: ClientSettingsData;
    hasStoredRecord: boolean;
  }>
> {
  try {
    const row = await fetchSettingsRow(companyId);
    return {
      ok: true,
      data: {
        settings: mergeSettingsFromStorage(defaults, row),
        hasStoredRecord: !!row,
      },
    };
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Error al cargar configuración.";
    console.warn("[client-settings] getCompanySettings", error);
    return { ok: false, error: msg };
  }
}

export async function upsertCompanySettings(
  input: ClientCompanySettingsInput,
): Promise<CompanySettingsServiceResult<ClientSettingsData>> {
  try {
    validateClientSettings(input.settings);

    const payload = uiSettingsToPayload(input.settings);
    const { data, error } = await getSupabase()
      .from("client_company_settings")
      .upsert(
        {
          company_id: input.companyId,
          user_id: input.userId ?? null,
          company_data: payload.company_data,
          billing_data: payload.billing_data,
          notification_settings: payload.notification_settings,
          panel_preferences: payload.panel_preferences,
          sms_preferences: payload.sms_preferences,
          metadata: payload.metadata ?? {},
          source: "client_panel",
        },
        { onConflict: "company_id" },
      )
      .select("*")
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        return {
          ok: false,
          error: "Tabla de configuración no disponible.",
          missingTable: true,
        };
      }
      wrapSupabaseError(error, "upsertCompanySettings");
    }

    return {
      ok: true,
      data: mergeSettingsFromStorage(input.settings, data as ClientCompanySettingsRow),
    };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: error.message };
    }
    const msg =
      error instanceof Error ? error.message : "No se pudo guardar la configuración.";
    console.warn("[client-settings] upsertCompanySettings", error);
    return { ok: false, error: msg };
  }
}

export async function mergeCompanySettings(
  companyId: string,
  defaults: ClientSettingsData,
  patch: Partial<ClientSettingsData>,
): Promise<CompanySettingsServiceResult<ClientSettingsData>> {
  const current = await getCompanySettings(companyId, defaults);
  if (!current.ok) {
    return current;
  }

  const merged = structuredClone(current.data.settings);
  if (patch.activeTab) merged.activeTab = patch.activeTab;
  if (patch.company) Object.assign(merged.company, patch.company);
  if (patch.billing) Object.assign(merged.billing, patch.billing);
  if (patch.notifications) Object.assign(merged.notifications, patch.notifications);
  if (patch.preferences) Object.assign(merged.preferences, patch.preferences);

  return upsertCompanySettings({
    companyId,
    settings: merged,
  });
}

export function validateClientSettings(settings: ClientSettingsData): void {
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (settings.company.contactEmail && !emailRe.test(settings.company.contactEmail)) {
    throw new AppError("El email de contacto no tiene un formato válido.", 400);
  }
  if (settings.billing.email && !emailRe.test(settings.billing.email)) {
    throw new AppError("El email de facturación no tiene un formato válido.", 400);
  }
  if (settings.company.website?.trim()) {
    try {
      const raw = settings.company.website.trim();
      const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
      if (!u.protocol.startsWith("http")) {
        throw new Error("invalid");
      }
    } catch {
      throw new AppError("El sitio web no tiene un formato válido.", 400);
    }
  }
  const th = settings.notifications.lowBalanceThreshold;
  if (th && (Number.isNaN(th) || th < 1)) {
    throw new AppError("El umbral de saldo bajo debe ser un número positivo.", 400);
  }
  const cur = settings.billing.currency?.trim().toUpperCase();
  if (cur && cur !== "CLP" && cur !== "USD") {
    throw new AppError("La moneda debe ser CLP o USD.", 400);
  }
}
