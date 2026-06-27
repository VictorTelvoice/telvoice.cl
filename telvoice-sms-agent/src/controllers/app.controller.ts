import { randomUUID } from "node:crypto";
import { APP_CLIENT_LIVE_SOURCE, PANEL_PRODUCTION_MODE } from "../constants/panel-sms-mode.js";
import type { NextFunction, Request, Response } from "express";
import { canOperateClientPanel } from "../types/roles.js";
import {
  getClientCatalogPackages,
  getClientDashboardData,
} from "../services/clientDashboardService.js";
import { loadAppContextCore } from "../services/appContextCache.js";
import {
  createOrder,
  getOrderById,
  getOrderWithDetailsForCompany,
  listSmsOrdersByCompany,
} from "../services/smsOrderService.js";
import { getCompanyBalance } from "../services/smsWalletService.js";
import { listTransactionsByCompany } from "../services/walletTransactionService.js";
import { env, isMercadoPagoConfigured } from "../config/env.js";
import { getPricingTiersForQuote } from "../services/pricing/smsPricingService.js";
import { getCompanySmsMpSubscription } from "../services/smsMpSubscriptionService.js";
import { getCompanyPaymentCard, saveCompanyPaymentCardPreferences } from "../services/companyPaymentCardService.js";
import { startPaymentCardSetupCheckout } from "../services/mercadoPagoClientPanelService.js";
import type { PaymentBillingMode } from "../types/company-payment-card.js";
import { filterClientAccountOrders, isClientAccountOrder, isQaTransaction, parseAppOrdersPageFilters } from "../utils/order-display.js";
import { validateUuidParam } from "../utils/validation.js";
import { resolveBuySmsPackageId } from "../utils/buy-sms-body.js";
import { IVA_RATE } from "../utils/clp-format.js";
import {
  buildVolumeTierRanges,
  SMS_BAG_CALC_MAX_VOLUME,
} from "../utils/smsBagCalculator.js";
import type { AppPageContext } from "../views/app-ui/app-page-wrap.js";
import {
  renderNoCompanyPage,
} from "../views/app-ui/app-page-wrap.js";
import {
  renderAppDashboardPage,
} from "../views/app-ui/app-pages.js";
import {
  renderAppWalletPage,
  parseWalletPageFilters,
} from "../views/app-ui/app-wallet-page.js";
import {
  renderAppWalletPaymentCardPage,
} from "../views/app-ui/app-wallet-payment-card-ui.js";
import {
  renderAppCampaignsPage,
  renderAppInboxPage,
  renderAppSendSmsPage,
  type SendPageContactListPick,
  type SendPageTemplatePick,
} from "../views/app-ui/app-sms-pages.js";
import {
  renderAppCampaignDetailPage,
  renderAppCampaignNotFoundPage,
} from "../views/app-ui/app-campaign-detail-page.js";
import {
  renderAppBuySmsPage,
  renderAppOrderDetailPage,
  renderAppOrderNotFoundPage,
  renderAppOrdersPage,
} from "../views/app-ui/app-order-pages.js";
import {
  renderAppContactsPage,
  parseContactsPageFilters,
  parseContactsWizardState,
  renderAppSupportPage,
} from "../views/app-ui/app-section-pages.js";
import type { ContactStatus, ContactSummary } from "../types/contacts.js";
import {
  bulkMoveContactsToList,
  bulkUpdateContactStatus,
  createContact,
  createContactList,
  deleteContact,
  duplicateContactList,
  archiveContactList,
  getContactSummary,
  getContactsModuleState,
  getContactById,
  listContactLists,
  listContacts,
  setContactAgendaMembership,
  updateContact,
  updateContactList,
} from "../services/contactService.js";
import {
  createContactImportJob,
  getContactImportJob,
  importValidatedContacts,
} from "../services/contactImportService.js";
import { createContactTag, bulkAssignTag } from "../services/contactTagService.js";
import {
  getSmsTemplatesModuleState,
  listSmsTemplates,
} from "../services/clientSmsTemplateService.js";
import {
  addSupportTicketReply,
  createSupportTicket,
  getSupportTicketsModuleState,
  listSupportTickets,
  markSupportTicketResolved,
} from "../services/clientSupportTicketService.js";
import type { SupportTicketPriority, SupportTicket } from "../types/support-tickets.js";
import { renderAppCampaignNewPage } from "../views/app-ui/app-campaigns-new-page.js";
import { suggestSenderIdFromCompany } from "../utils/suggestSenderId.js";
import { resolveInternalQaCompanyId } from "../services/internalQaCompanyService.js";
import {
  audienceHiddenFields,
  buildCampaignPreviewFromRequest,
  createCampaignDraftFromPreview,
} from "../services/campaignPreviewService.js";
import { launchLiveCampaign } from "../services/campaignLiveLaunchService.js";
import { loadCampaignDetailView } from "../services/campaignDetailService.js";
import { getCampaignLiveReadiness } from "../services/campaignReadinessService.js";
import { parseAudienceSourceFromQuery } from "../services/campaignAudienceService.js";
import {
  getCampaignByIdForCompany,
  listCampaignsByCompany,
} from "../services/smsCampaignService.js";
import { getPanelSmsMessageById } from "../services/panelSmsMessageService.js";
import type {
  MockSmsSendResult,
  PanelCampaignSendResult,
  PanelSmsMessageStatus,
} from "../types/sms-panel.js";
import type { SmsOrderRow } from "../types/wallet.js";
import {
  sendPanelCampaign,
  type MassCampaignSendRow,
} from "../services/smsPanelCampaignSendService.js";
import { parseMassCampaignRowsJson } from "../utils/csvMassCampaign.js";
import { MOCK_CONTACT_LISTS } from "../views/admin-ui/mock-data-stage3.js";
import { listPanelMessagesByCompany } from "../services/panelSmsMessageService.js";
import {
  parseDlrReportFilters,
  queryDlrReport,
  dlrReportRowsToCsv,
} from "../services/smsDlrReportService.js";
import { renderAppReportsPage } from "../views/app-ui/app-reports-page.js";
import { generateClientPanelManualPdf } from "../services/clientPanelManualPdfService.js";
import { renderAppManualPage } from "../views/app-ui/app-manual-page.js";
import {
  parseAppInvoiceFilters,
  renderAppInvoiceDetailPage,
  renderAppInvoiceNotFoundPage,
  renderAppInvoicesPage,
} from "../views/app-ui/app-invoice-pages.js";
import {
  getCompanyInvoiceById,
  getInvoiceByOrderId,
  listCompanyInvoices,
  summarizeCompanyInvoices,
} from "../services/billingInvoiceService.js";
import { findPaidCreditedOrdersWithoutInvoice } from "../services/billingRecoveryService.js";
import { runBillingSyncBestEffort } from "../services/billingSyncService.js";
import {
  generateInvoiceHtmlFromData,
  sanitizeInvoiceDocumentData,
} from "../services/billingDocumentService.js";
import { getLiveTestSendPageStatus } from "../services/smsLiveTestLimiterService.js";
import { canCompanyUseLiveTestUi } from "../services/smsProviderStatusService.js";
import {
  getSendControlPanelView,
  resolveVerifyTestSend,
} from "../services/smsSendControlPanelService.js";
import { sendPanelSms } from "../services/smsSendService.js";
import {
  beginSendSmsIdempotency,
  completeSendSmsIdempotency,
  failSendSmsIdempotency,
  panelCampaignSendResultFromRow,
  type SendSmsRedirectParams,
} from "../services/smsSendIdempotencyService.js";
import { AppError } from "../utils/errors.js";
import {
  APP_SCHEDULE_TIMEZONE,
  buildScheduledIsoInTimeZone,
  formatScheduleInTimeZone,
  isScheduleAtLeastMinutesAhead,
} from "../utils/scheduleTime.js";
import { escapeHtml } from "../utils/html.js";

type AppSendMode = "single" | "mass" | "scheduled" | "template";

function parseBulkRecipients(raw: string): string[] {
  const lines = raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(lines)];
}

function resolveMockListNumbers(listId: string): string[] {
  const list = MOCK_CONTACT_LISTS.find((l) => l.id === listId);
  return list ? [...list.sampleNumbers] : [];
}

function formatScheduleCl(iso: string): string {
  return formatScheduleInTimeZone(iso, APP_SCHEDULE_TIMEZONE);
}

function collectRecipientsFromSendForm(req: Request): string[] {
  let recipients = parseBulkRecipients(String(req.body?.bulk_recipients ?? ""));
  const listId = String(req.body?.contact_list ?? "").trim();
  if (listId) {
    recipients = [...recipients, ...resolveMockListNumbers(listId)];
  }
  recipients = [...new Set(recipients)];
  if (recipients.length === 0) {
    const to = String(req.body?.to ?? "").trim();
    if (to) recipients = [to];
  }
  return recipients;
}

function collectMassCampaignRows(req: Request): {
  rows: MassCampaignSendRow[];
  defaultMessage: string;
  hasPerRowMessages: boolean;
} {
  const defaultMessage = String(req.body?.message ?? "").trim();
  const fromJson = parseMassCampaignRowsJson(
    String(req.body?.bulk_rows_json ?? ""),
  );

  if (fromJson?.length) {
    const hasPerRowMessages = fromJson.some((r) => r.message.trim().length > 0);
    return { rows: fromJson, defaultMessage, hasPerRowMessages };
  }

  const recipients = collectRecipientsFromSendForm(req);
  return {
    rows: recipients.map((phone) => ({ phone, message: defaultMessage })),
    defaultMessage,
    hasPerRowMessages: false,
  };
}

async function trySendProductionCampaignFromForm(
  req: Request,
  ctx: AppPageContext,
  idempotencyKey: string,
): Promise<{ result: PanelCampaignSendResult; activeMode: AppSendMode } | null> {
  const sendMode = String(req.body?.send_mode ?? "single") as AppSendMode;
  if (sendMode === "template") {
    const recipients = collectRecipientsFromSendForm(req);
    if (recipients.length <= 1) {
      return null;
    }
  } else if (sendMode !== "mass" && sendMode !== "scheduled") {
    return null;
  }

  const campaignMode: "mass" | "scheduled" =
    sendMode === "scheduled" ? "scheduled" : "mass";

  const massPayload = collectMassCampaignRows(req);
  if (massPayload.rows.length === 0) {
    throw new AppError(
      sendMode === "scheduled"
        ? "Agrega destinatarios con lista, CSV o archivo con columnas número y mensaje."
        : sendMode === "template"
          ? "Selecciona una agenda con al menos un contacto válido."
          : "Agrega al menos un destinatario válido (lista o CSV).",
      400,
    );
  }

  if (!massPayload.hasPerRowMessages && !massPayload.defaultMessage) {
    throw new AppError(
      sendMode === "template"
        ? "Selecciona una plantilla SMS o escribe el mensaje."
        : "Indica un mensaje común o sube un CSV con columnas número y mensaje.",
      400,
    );
  }

  const senderId = String(
    req.body?.sender_id ?? suggestSenderIdFromCompany(ctx.company),
  ).trim();
  const campaignName =
    String(req.body?.campaign_name ?? "").trim() ||
    (sendMode === "scheduled"
      ? "Envío programado"
      : sendMode === "template"
        ? "Envío desde plantilla"
        : "Campaña masiva");

  let scheduledAt: string | null = null;
  if (sendMode === "scheduled") {
    scheduledAt = buildScheduledIsoInTimeZone(
      String(req.body?.schedule_date ?? ""),
      String(req.body?.schedule_time ?? ""),
      APP_SCHEDULE_TIMEZONE,
    );
    if (!scheduledAt) {
      throw new AppError(
        "Indica una fecha y hora válidas (hora Chile).",
        400,
      );
    }
    if (!isScheduleAtLeastMinutesAhead(scheduledAt, 1)) {
      throw new AppError(
        "La fecha programada debe ser al menos 1 minuto en el futuro (hora de Chile).",
        400,
      );
    }
  }

  const result = await sendPanelCampaign({
    companyId: ctx.company.id,
    senderId,
    message: massPayload.defaultMessage,
    rows: massPayload.rows,
    campaignName,
    mode: campaignMode,
    scheduledAt: campaignMode === "scheduled" ? scheduledAt : null,
    createdBy:
      ctx.profile.profileId ?? ctx.profile.adminUserId ?? undefined,
    sendSource: `app_send_sms_${sendMode}`,
    idempotencyKey,
  });

  return { result, activeMode: sendMode };
}

function campaignResultFlash(
  result: PanelCampaignSendResult,
  sendMode: AppSendMode,
): string {
  if (result.queued > 0 && result.sent === 0) {
    const when =
      sendMode === "scheduled" && result.scheduledAt
        ? ` para ${formatScheduleCl(result.scheduledAt)}`
        : "";
    const failNote =
      result.failed > 0 ? ` (${result.failed} filas no encoladas)` : "";
    return `Campaña «${result.campaignName}»: ${result.queued} mensaje(s) en cola${when}. El despacho corre en segundo plano (~20 SMS/s según TPS).${failNote}`;
  }
  if (sendMode === "scheduled" && result.scheduledAt) {
    const when = formatScheduleCl(result.scheduledAt);
    return `Programado ${when}: ${result.sent} enviado(s), ${result.failed} fallido(s). Campaña «${result.campaignName}».`;
  }
  return `Campaña «${result.campaignName}» procesada: ${result.sent} enviado(s), ${result.failed} fallido(s), ${result.smsConsumed} SMS consumidos.`;
}

function flash(req: Request): { flash?: string; error?: string } {
  return {
    flash: typeof req.query.ok === "string" ? req.query.ok : undefined,
    error: typeof req.query.error === "string" ? req.query.error : undefined,
  };
}

/** Evita reenvío duplicado al refrescar (Post-Redirect-Get). */
function redirectSendSmsSuccess(
  res: Response,
  params: SendSmsRedirectParams | Record<string, string | undefined>,
): void {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) q.set(key, value);
  }
  res.redirect(303, `/app/send-sms?${q.toString()}`);
}

async function loadSendOutcomeFromQuery(
  req: Request,
  companyId: string,
): Promise<{
  sendResult?: MockSmsSendResult | null;
  campaignResult?: PanelCampaignSendResult | null;
  activeMode?: AppSendMode;
}> {
  const activeMode =
    typeof req.query.mode === "string" &&
    ["single", "mass", "scheduled", "template"].includes(req.query.mode)
      ? (req.query.mode as AppSendMode)
      : undefined;

  let sendResult: MockSmsSendResult | null = null;
  let campaignResult: PanelCampaignSendResult | null = null;

  const messageIdRaw =
    typeof req.query.message_id === "string" ? req.query.message_id : "";
  if (messageIdRaw) {
    try {
      const messageId = validateUuidParam(messageIdRaw, "message_id");
      const m = await getPanelSmsMessageById(messageId);
      if (m?.company_id === companyId) {
        const bal = await getCompanyBalance(companyId);
        sendResult = {
          messageId: m.id,
          campaignId: m.campaign_id ?? "",
          recipientNumber: m.recipient_number,
          segments: m.segments,
          balanceBefore: bal.availableSms + m.cost_sms,
          balanceAfter: bal.availableSms,
          status: m.status,
          providerMessageId: m.provider_message_id ?? "",
          sendMode: PANEL_PRODUCTION_MODE,
        };
      }
    } catch {
      /* query inválido */
    }
  }

  const campaignIdRaw =
    typeof req.query.campaign_id === "string" ? req.query.campaign_id : "";
  if (campaignIdRaw) {
    try {
      const campaignId = validateUuidParam(campaignIdRaw, "campaign_id");
      const c = await getCampaignByIdForCompany(campaignId, companyId);
      if (c) {
        campaignResult = await panelCampaignSendResultFromRow(c, companyId);
      }
    } catch {
      /* query inválido */
    }
  }

  return { sendResult, campaignResult, activeMode };
}

export async function buildAppContext(req: Request): Promise<AppPageContext | null> {
  const profile = req.userProfile;
  if (!profile?.companyId) {
    return null;
  }

  const core = await loadAppContextCore(profile);
  if (!core) {
    return null;
  }

  return {
    ...core,
    ...flash(req),
  };
}

async function withAppContext(
  req: Request,
  res: Response,
  next: NextFunction,
  render: (ctx: AppPageContext) => string | Promise<string>,
): Promise<void> {
  try {
    const ctx = await buildAppContext(req);
    if (!ctx) {
      const profile = req.userProfile;
      if (!profile) {
        res.redirect("/login?next=%2Fapp");
        return;
      }
      res.type("html").send(renderNoCompanyPage(profile));
      return;
    }
    res.type("html").send(await render(ctx));
  } catch (error) {
    next(error);
  }
}

export function getAppRoot(_req: Request, res: Response): void {
  res.redirect("/app/dashboard");
}

export async function getAppDashboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const data = await getClientDashboardData(ctx.company.id, "CL", {
      company: ctx.company,
      balance: ctx.balance,
    });
    const showWelcomeBanner = req.query.welcome === "1";
    return renderAppDashboardPage(ctx, data, { showWelcomeBanner });
  });
}

export async function getAppBuySms(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const tiers = await getPricingTiersForQuote(ctx.company.country);
    const error =
      typeof req.query.error === "string" ? req.query.error.trim() : undefined;
    const pageCtx = error ? { ...ctx, error } : ctx;
    const smsSubscription = await getCompanySmsMpSubscription(ctx.company.id);
    return renderAppBuySmsPage(
      pageCtx,
      {
        volumeTierRanges: buildVolumeTierRanges(tiers, SMS_BAG_CALC_MAX_VOLUME),
        calcMaxVolume: SMS_BAG_CALC_MAX_VOLUME,
        ivaRate: IVA_RATE,
      },
      {
        mercadoPagoAvailable: isMercadoPagoConfigured(),
        // Pago manual deshabilitado hasta habilitar operación (ignora env en prod).
        manualCheckoutEnabled: false,
        smsSubscription,
      },
    );
  });
}

export async function postAppBuySms(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await buildAppContext(req);
    if (!ctx) {
      res.redirect("/app/buy-sms?error=Empresa%20no%20asociada");
      return;
    }

    if (!canOperateClientPanel(ctx.profile.role)) {
      res.redirect("/app/buy-sms?error=No%20tienes%20permiso%20para%20comprar");
      return;
    }

    if (!env.clientPanel.manualCheckoutEnabled) {
      res.redirect(
        "/app/buy-sms?error=El%20pago%20manual%20no%20est%C3%A1%20disponible%20a%C3%BAn.",
      );
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const packageId = await resolveBuySmsPackageId(body, ctx.company.country);

    const order = await createOrder({
      companyId: ctx.company.id,
      packageId,
      createdBy: ctx.profile.profileId ?? ctx.profile.adminUserId ?? undefined,
      paymentProvider: "pending_checkout",
      paymentReference: `APP-${Date.now()}`,
    });

    res.redirect(`/app/orders/${order.id}?created=1`);
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "No se pudo crear la orden";
    res.redirect(`/app/buy-sms?error=${encodeURIComponent(msg)}`);
  }
}

export async function getAppWallet(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const filters = parseWalletPageFilters(
      req.query as Record<string, string | string[] | undefined>,
    );
    const transactions = (
      await listTransactionsByCompany(ctx.company.id, 200, {
        type: filters.type,
        startDate: filters.startDate,
        endDate: filters.endDate,
      })
    ).filter((t) => !isQaTransaction(t));
    return renderAppWalletPage(ctx, transactions, filters);
  });
}

function parseBillingMode(raw: unknown): PaymentBillingMode {
  return raw === "recurring" ? "recurring" : "on_demand";
}

export async function getAppWalletPaymentCard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const card = await getCompanyPaymentCard(ctx.company.id);
    const packages = await getClientCatalogPackages(ctx.company.country);
    const ok =
      typeof req.query.ok === "string" ? req.query.ok : undefined;
    const error =
      typeof req.query.error === "string" ? req.query.error : undefined;
    return renderAppWalletPaymentCardPage(
      ctx,
      card,
      packages,
      isMercadoPagoConfigured(),
      { ok, error },
    );
  });
}

export async function postAppWalletPaymentCard(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const profile = req.userProfile;
    if (!profile?.companyId) {
      res.redirect("/app/wallet/payment-card?error=Empresa%20no%20asociada");
      return;
    }
    if (!canOperateClientPanel(profile.role)) {
      res.redirect(
        "/app/wallet/payment-card?error=No%20tienes%20permiso%20para%20configurar",
      );
      return;
    }
    const billingMode = parseBillingMode(req.body?.billing_mode);
    const autoRecharge = req.body?.auto_recharge === "1";
    const packageId = String(req.body?.default_package_id ?? "").trim() || null;

    await saveCompanyPaymentCardPreferences(profile.companyId, {
      billingMode,
      autoRechargeEnabled: autoRecharge,
      defaultPackageId: packageId,
    });

    res.redirect("/app/wallet/payment-card?ok=Preferencias%20guardadas");
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "No se pudo guardar";
    res.redirect(
      `/app/wallet/payment-card?error=${encodeURIComponent(msg)}`,
    );
  }
}

export async function postAppWalletPaymentCardLink(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const profile = req.userProfile;
    if (!profile?.companyId) {
      res.redirect("/app/wallet/payment-card?error=Empresa%20no%20asociada");
      return;
    }
    if (!canOperateClientPanel(profile.role)) {
      res.redirect(
        "/app/wallet/payment-card?error=No%20tienes%20permiso%20para%20comprar",
      );
      return;
    }
    if (!isMercadoPagoConfigured()) {
      res.redirect(
        "/app/wallet/payment-card?error=Mercado%20Pago%20no%20disponible",
      );
      return;
    }

    const packageId = validateUuidParam(
      String(req.body?.package_id ?? ""),
      "package_id",
    );
    const card = await getCompanyPaymentCard(profile.companyId);

    const checkout = await startPaymentCardSetupCheckout({
      companyId: profile.companyId,
      packageId,
      createdBy: profile.profileId ?? profile.adminUserId ?? undefined,
      payer: {
        email: profile.email,
        name: profile.fullName,
        phone: null,
      },
      billingMode: card.billingMode,
      autoRechargeEnabled: card.autoRechargeEnabled,
    });

    res.redirect(checkout.checkoutUrl);
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "No se pudo vincular tarjeta";
    res.redirect(
      `/app/wallet/payment-card?error=${encodeURIComponent(msg)}`,
    );
  }
}

export async function getAppOrders(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const orders = filterClientAccountOrders(
      await listSmsOrdersByCompany(ctx.company.id, 100),
    );
    const filters = parseAppOrdersPageFilters(
      req.query as Record<string, string | string[] | undefined>,
    );
    return renderAppOrdersPage(ctx, orders, filters);
  });
}

export async function getAppOrderDetail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const orderId = validateUuidParam(String(req.params.id), "id");
    const order = await getOrderWithDetailsForCompany(
      orderId,
      ctx.company.id,
    );
    if (!order || !isClientAccountOrder(order)) {
      return renderAppOrderNotFoundPage(ctx);
    }
    const showCreatedBanner = req.query.created === "1";
    const invoice = await getInvoiceByOrderId(orderId);
    return renderAppOrderDetailPage(ctx, order, {
      showCreatedBanner: showCreatedBanner,
      invoiceId: invoice?.id ?? null,
    });
  });
}

async function loadSendPageContactData(
  companyId: string,
): Promise<{ contactLists: SendPageContactListPick[] }> {
  const module = await getContactsModuleState();
  if (!module.available) {
    return { contactLists: [] };
  }

  const lists = await listContactLists(companyId);

  const contactLists = await Promise.all(
    lists.map(async (l) => {
      const members = await listContacts(companyId, {
        listId: l.id,
        status: "active",
        limit: 5000,
      });
      return {
        id: l.id,
        name: l.name,
        count: l.contacts_count,
        phones: members.map((m) => m.phone_normalized.replace(/^\+/, "")),
      };
    }),
  );

  return { contactLists };
}

async function loadSendPageTemplateData(
  companyId: string,
): Promise<{ smsTemplates: SendPageTemplatePick[] }> {
  const module = await getSmsTemplatesModuleState();
  if (!module.available) {
    return { smsTemplates: [] };
  }

  const listed = await listSmsTemplates(companyId);
  if (!listed.ok) {
    return { smsTemplates: [] };
  }

  return {
    smsTemplates: listed.data.map((t) => ({
      id: t.id,
      name: t.name,
      message: t.message,
      status: t.status,
    })),
  };
}

export async function getAppSendSms(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const error =
      typeof req.query.error === "string" ? req.query.error : undefined;
    const sendEnabled = canCompanyUseLiveTestUi(ctx.company.id);
    const { flash: okFlash, error: errFlash } = flash(req);

    const [liveTestStatus, outcome, sendContacts, sendTemplates] = await Promise.all([
      sendEnabled
        ? getLiveTestSendPageStatus(ctx.company.id)
        : Promise.resolve(null),
      loadSendOutcomeFromQuery(req, ctx.company.id),
      loadSendPageContactData(ctx.company.id),
      loadSendPageTemplateData(ctx.company.id),
    ]);

    const controlPanel =
      sendEnabled && liveTestStatus
        ? await getSendControlPanelView(ctx.company.id, liveTestStatus)
        : null;

    const idempotencyKey = sendEnabled ? randomUUID() : undefined;

    return renderAppSendSmsPage(ctx, {
      error: error ?? errFlash,
      flash: okFlash,
      activeMode: outcome.activeMode,
      sendResult: outcome.sendResult,
      campaignResult: outcome.campaignResult,
      sendEnabled,
      liveTestStatus,
      controlPanel,
      idempotencyKey,
      contactLists: sendContacts.contactLists,
      smsTemplates: sendTemplates.smsTemplates,
    });
  });
}

export async function postAppSendSms(
  req: Request,
  res: Response,
): Promise<void> {
  const idempotencyKey = String(req.body?.idempotency_key ?? "").trim();
  let companyId: string | undefined;

  try {
    const ctx = await buildAppContext(req);
    if (!ctx) {
      res.redirect("/app/send-sms?error=Empresa%20no%20asociada");
      return;
    }

    companyId = ctx.company.id;

    if (!canOperateClientPanel(ctx.profile.role)) {
      res.redirect(
        "/app/send-sms?error=No%20tienes%20permiso%20para%20enviar%20SMS",
      );
      return;
    }

    if (!idempotencyKey) {
      res.redirect(
        "/app/send-sms?error=" +
          encodeURIComponent(
            "Sesión de envío inválida. Recarga la página Enviar SMS e intenta de nuevo.",
          ),
      );
      return;
    }

    const claim = await beginSendSmsIdempotency(
      companyId,
      idempotencyKey,
      ctx.profile.profileId ?? ctx.profile.adminUserId ?? null,
    );
    if (claim.action === "replay") {
      redirectSendSmsSuccess(res, claim.redirect);
      return;
    }
    if (claim.action === "busy") {
      res.redirect(
        "/app/send-sms?error=" +
          encodeURIComponent(
            "Este envío ya se está procesando. Espera unos segundos y revisa Campañas o Bandeja.",
          ),
      );
      return;
    }

    const campaignSend = await trySendProductionCampaignFromForm(
      req,
      ctx,
      idempotencyKey,
    );
    if (campaignSend) {
      const redirect: SendSmsRedirectParams = {
        ok: campaignResultFlash(
          campaignSend.result,
          campaignSend.activeMode,
        ),
        mode: campaignSend.activeMode,
        campaign_id: campaignSend.result.campaignId,
      };
      await completeSendSmsIdempotency({
        companyId,
        key: idempotencyKey,
        redirect,
      });
      redirectSendSmsSuccess(res, redirect);
      return;
    }

    const isVerifyTest =
      req.body?.quick_verify === "1" ||
      (typeof req.body?.verify_id === "string" && req.body.verify_id.trim());

    let to = String(req.body?.to ?? "");
    let message = String(req.body?.message ?? "");
    let campaignName =
      typeof req.body?.campaign_name === "string"
        ? req.body.campaign_name
        : undefined;

    if (isVerifyTest && typeof req.body?.verify_id === "string") {
      const resolved = resolveVerifyTestSend({
        verifyId: req.body.verify_id.trim(),
        message: req.body?.message,
      });
      if (!resolved) {
        res.redirect(
          "/app/send-sms?error=" +
            encodeURIComponent("Número de verificación no encontrado."),
        );
        return;
      }
      to = resolved.to;
      message = resolved.message;
      campaignName = `QA Verify — ${resolved.label}`;
    }

    const verifyTestCompanyId = resolveInternalQaCompanyId();

    const result = await sendPanelSms({
      companyId: isVerifyTest ? verifyTestCompanyId : ctx.company.id,
      senderId: String(
        req.body?.sender_id ??
          suggestSenderIdFromCompany(ctx.company),
      ),
      to,
      message,
      campaignName,
      createdBy:
        ctx.profile.profileId ?? ctx.profile.adminUserId ?? undefined,
      sendSource: isVerifyTest
        ? "app_send_sms_verify_test"
        : APP_CLIENT_LIVE_SOURCE,
      idempotencyKey,
    });

    const okMsg = isVerifyTest
      ? `Test QA enviado a ${result.recipientNumber}. Estado: ${result.status}.`
      : `SMS enviado a ${result.recipientNumber}. ${result.segments} segmento(s). Saldo: ${result.balanceAfter} SMS.`;

    const redirect: SendSmsRedirectParams = {
      ok: okMsg,
      mode: "single",
      message_id: result.messageId,
    };
    await completeSendSmsIdempotency({
      companyId,
      key: idempotencyKey,
      redirect,
    });
    redirectSendSmsSuccess(res, redirect);
  } catch (error) {
    const msg =
      error instanceof AppError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudo enviar el SMS";
    if (companyId && idempotencyKey) {
      try {
        await failSendSmsIdempotency({
          companyId,
          key: idempotencyKey,
          errorText: msg,
        });
      } catch {
        /* no bloquear redirect de error */
      }
    }
    res.redirect(`/app/send-sms?error=${encodeURIComponent(msg)}`);
  }
}

function audienceParamsFromRequest(
  req: Request | { query?: Record<string, unknown>; body?: Record<string, string | undefined> },
): Record<string, string | undefined> {
  const q = req.query as Record<string, string | string[] | undefined> | undefined;
  const b = (req as Request).body as Record<string, string | undefined> | undefined;
  const str = (src: Record<string, string | string[] | undefined> | undefined, key: string) => {
    const v = src?.[key];
    return typeof v === "string" ? v : undefined;
  };
  return {
    contacts: str(q, "contacts") ?? b?.contacts,
    list_id: str(q, "list_id") ?? b?.list_id,
    tag_id: str(q, "tag_id") ?? b?.tag_id,
    sender_id: str(q, "sender_id") ?? b?.sender_id,
    message: str(q, "message") ?? b?.message,
    campaign_name: str(q, "campaign_name") ?? b?.campaign_name,
  };
}

export async function getAppCampaignNew(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const params = audienceParamsFromRequest(req);
    const source = parseAudienceSourceFromQuery(params);
    const defaultSenderId = suggestSenderIdFromCompany(ctx.company);

    if (!source) {
      return renderAppCampaignNewPage(ctx, {
        preview: {
          audience: {
            sourceType: "contacts",
            sourceLabel: "—",
            sourceRef: "",
            totalFound: 0,
            validCount: 0,
            invalidCount: 0,
            blockedCount: 0,
            optOutCount: 0,
            duplicatesOmitted: 0,
            validRecipients: [],
            allMembers: [],
          },
          campaignName: `Campaña ${new Date().toISOString().slice(0, 10)}`,
          senderId: defaultSenderId,
          message: "",
          characters: 0,
          encoding: "GSM-7",
          segmentsPerMessage: 0,
          validRecipientCount: 0,
          totalSmsEstimated: 0,
          balanceAvailable: ctx.balance.availableSms,
          balanceAfter: ctx.balance.availableSms,
          canProceed: false,
          blockReason: "Selecciona una audiencia desde Contactos.",
          sendEnabled: false,
        },
        defaultSenderId,
        noAudience: true,
      });
    }

    const preview = await buildCampaignPreviewFromRequest(ctx.company.id, {
      ...params,
      sender_id: params.sender_id ?? defaultSenderId,
      message: params.message ?? "",
    });

    return renderAppCampaignNewPage(ctx, {
      preview,
      defaultSenderId,
    });
  });
}

export async function postAppCampaignNewPreview(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireContactsWriteContext(req);
    if (!ctx) {
      res.redirect("/app/campaigns/new?error=Sin%20permiso");
      return;
    }
    const params = audienceParamsFromRequest(req);
    const preview = await buildCampaignPreviewFromRequest(ctx.company.id, params);
    const q = new URLSearchParams(audienceHiddenFields(preview.audience));
    q.set("sender_id", preview.senderId);
    q.set("message", preview.message);
    q.set("campaign_name", preview.campaignName);
    res.redirect(303, `/app/campaigns/new?${q.toString()}&ok=Previsualizaci%C3%B3n%20actualizada`);
  } catch (error) {
    const msg =
      error instanceof AppError ? error.message : "No se pudo calcular la previsualización";
    res.redirect(303, `/app/campaigns/new?error=${encodeURIComponent(msg)}`);
  }
}

export async function postAppCampaignDraft(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireContactsWriteContext(req);
    if (!ctx) {
      res.redirect("/app/campaigns?error=Sin%20permiso");
      return;
    }
    const params = audienceParamsFromRequest(req);
    const preview = await buildCampaignPreviewFromRequest(ctx.company.id, params);
    const draft = await createCampaignDraftFromPreview(
      ctx.company.id,
      preview,
      ctx.profile.profileId ?? ctx.profile.adminUserId ?? null,
    );
    res.redirect(
      303,
      `/app/campaigns/${draft.id}?ok=${encodeURIComponent(`Borrador «${draft.name}» guardado.`)}`,
    );
  } catch (error) {
    const msg =
      error instanceof AppError ? error.message : "No se pudo guardar el borrador";
    res.redirect(303, `/app/campaigns/new?error=${encodeURIComponent(msg)}`);
  }
}

export async function postAppCampaignExecuteMock(
  req: Request,
  res: Response,
): Promise<void> {
  const campaignId = validateUuidParam(String(req.params.id), "id");
  res.redirect(
    303,
    `/app/campaigns/${campaignId}?error=${encodeURIComponent("La simulación mock está deshabilitada. Usa el envío live desde el detalle de la campaña.")}`,
  );
}

export async function postAppCampaignLaunchLive(
  req: Request,
  res: Response,
): Promise<void> {
  const campaignId = validateUuidParam(String(req.params.id), "id");
  try {
    const ctx = await requireContactsWriteContext(req);
    if (!ctx) {
      res.redirect("/app/campaigns?error=Sin%20permiso");
      return;
    }
    const consentConfirmed =
      req.body?.consent_confirmed === "1" ||
      req.body?.consent_confirmed === true ||
      req.body?.consent_confirmed === "on";
    const confirmText =
      typeof req.body?.confirm_text === "string" ? req.body.confirm_text : "";

    const result = await launchLiveCampaign(ctx.company.id, campaignId, {
      consentConfirmed,
      confirmText,
      launchedBy: ctx.profile.profileId ?? ctx.profile.adminUserId ?? null,
    });

    const okMsg = `Campaña enviada a cola: ${result.messagesQueued} mensaje(s) live queued · TPS ${result.effectiveTps}. Procesamiento vía cola (sin envío directo desde esta acción).`;
    res.redirect(
      303,
      `/app/campaigns/${campaignId}?ok=${encodeURIComponent(okMsg)}`,
    );
  } catch (error) {
    const msg =
      error instanceof AppError
        ? error.message
        : "No se pudo lanzar la campaña en modo real";
    res.redirect(
      303,
      `/app/campaigns/${campaignId}?error=${encodeURIComponent(msg)}`,
    );
  }
}

export async function getAppCampaignDetail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const campaignId = validateUuidParam(String(req.params.id), "id");
    const campaign = await getCampaignByIdForCompany(
      campaignId,
      ctx.company.id,
    );
    if (!campaign) {
      return renderAppCampaignNotFoundPage(ctx);
    }
    const detail = await loadCampaignDetailView(ctx.company.id, campaign);
    const liveReadiness = await getCampaignLiveReadiness(
      ctx.company.id,
      campaignId,
    );
    const ok = typeof req.query.ok === "string" ? req.query.ok : undefined;
    const err =
      typeof req.query.error === "string" ? req.query.error : undefined;
    return renderAppCampaignDetailPage(
      { ...ctx, flash: ok, error: err },
      detail,
      liveReadiness,
    );
  });
}

export async function getAppCampaigns(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const status =
      typeof req.query.status === "string" ? req.query.status.trim() : "";
    const senderId =
      typeof req.query.sender_id === "string" ? req.query.sender_id.trim() : "";
    const startDate =
      typeof req.query.start_date === "string" ? req.query.start_date.trim() : "";
    const endDate =
      typeof req.query.end_date === "string" ? req.query.end_date.trim() : "";

    const allowed = new Set([
      "draft",
      "processing",
      "sent",
      "completed",
      "failed",
      "cancelled",
    ]);
    const safeStatus = allowed.has(status) ? (status as any) : undefined;

    const campaigns = await listCampaignsByCompany(ctx.company.id, 100, {
      q: q || undefined,
      status: safeStatus,
      senderId: senderId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });

    return renderAppCampaignsPage(ctx, campaigns, {
      q: q || undefined,
      status: status || undefined,
      senderId: senderId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  });
}

export async function getAppInbox(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const reference =
      typeof req.query.reference === "string" ? req.query.reference.trim() : "";
    const status =
      typeof req.query.status === "string" ? req.query.status.trim() : "";
    const senderId =
      typeof req.query.sender_id === "string" ? req.query.sender_id.trim() : "";
    const recipient =
      typeof req.query.recipient === "string" ? req.query.recipient.trim() : "";
    const startDate =
      typeof req.query.start_date === "string" ? req.query.start_date.trim() : "";
    const endDate =
      typeof req.query.end_date === "string" ? req.query.end_date.trim() : "";

    const allowedStatus = new Set([
      "queued",
      "pending",
      "sent",
      "delivered",
      "failed",
      "rejected",
      "expired",
    ]);
    const safeStatus = allowedStatus.has(status)
      ? (status as PanelSmsMessageStatus)
      : undefined;

    const filterInput = {
      reference: reference || undefined,
      status: safeStatus,
      senderId: senderId || undefined,
      recipient: recipient || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    };

    const messages = await listPanelMessagesByCompany(
      ctx.company.id,
      200,
      filterInput,
    );

    return renderAppInboxPage(ctx, messages, {
      reference: reference || undefined,
      status: status || undefined,
      senderId: senderId || undefined,
      recipient: recipient || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  });
}

const EMPTY_CONTACT_SUMMARY: ContactSummary = {
  totalContacts: 0,
  activeLists: 0,
  validContacts: 0,
  duplicateContacts: 0,
  blockedOrOptOut: 0,
  activeTags: 0,
  importedThisMonth: 0,
  lastUpdatedAt: null,
};

function parseContactIdsFromBody(
  body: Record<string, string | undefined>,
): string[] {
  const raw = (body.contact_ids ?? "").trim();
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

async function requireContactsWriteContext(
  req: Request,
): Promise<AppPageContext | null> {
  const ctx = await buildAppContext(req);
  if (!ctx) return null;
  if (!canOperateClientPanel(ctx.profile.role)) return null;
  return ctx;
}

function contactsRedirectPath(
  params: Record<string, string | undefined>,
  filters?: ReturnType<typeof parseContactsPageFilters>,
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) qs.set(key, value);
  }
  if (filters?.q) qs.set("q", filters.q);
  if (filters?.agenda) qs.set("agenda", filters.agenda);
  const s = qs.toString();
  return `/app/contacts${s ? `?${s}` : ""}`;
}

function parseContactsFiltersFromBody(
  body: Record<string, string | undefined>,
): ReturnType<typeof parseContactsPageFilters> {
  return {
    q: body.filter_q?.trim() || undefined,
    agenda: body.filter_agenda?.trim() || undefined,
    tag: "",
    status: "",
    source: "",
    startDate: undefined,
    endDate: undefined,
  };
}

export async function getAppContacts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const filters = parseContactsPageFilters(
      req.query as Record<string, string | string[] | undefined>,
    );
    const wizardState = parseContactsWizardState(
      req.query as Record<string, string | string[] | undefined>,
    );
    const importJobId =
      typeof req.query.import_job === "string" ? req.query.import_job.trim() : "";

    const module = await getContactsModuleState();
    if (!module.available) {
      return renderAppContactsPage(ctx, {
        module,
        filters,
        contacts: [],
        lists: [],
        summary: EMPTY_CONTACT_SUMMARY,
      });
    }

    let importPreview;
    if (importJobId && module.importAvailable) {
      importPreview =
        (await getContactImportJob(ctx.company.id, importJobId)) ?? undefined;
    }

    const serviceFilters = {
      q: filters.q,
      listId: filters.agenda,
    };

    const [contacts, lists, summary] = await Promise.all([
      listContacts(ctx.company.id, serviceFilters),
      listContactLists(ctx.company.id),
      getContactSummary(ctx.company.id),
    ]);

    const q = req.query as Record<string, string | string[] | undefined>;
    const editContactId =
      typeof q.edit_contact === "string" ? q.edit_contact.trim() : "";
    const assignContactId =
      typeof q.assign_contact === "string" ? q.assign_contact.trim() : "";
    let editContact =
      editContactId ? contacts.find((c) => c.id === editContactId) : undefined;
    let assignContact =
      assignContactId ? contacts.find((c) => c.id === assignContactId) : undefined;
    if (editContactId && !editContact) {
      const row = await getContactById(ctx.company.id, editContactId);
      if (row) {
        editContact = {
          ...row,
          list_ids: [],
          list_names: [],
          tag_ids: [],
          tag_names: [],
        };
      }
    }
    if (assignContactId && !assignContact) {
      const row = await getContactById(ctx.company.id, assignContactId);
      if (row) {
        assignContact = {
          ...row,
          list_ids: [],
          list_names: [],
          tag_ids: [],
          tag_names: [],
        };
      }
    }

    const postCreateListId =
      typeof q.list_id === "string" && q.created === "1" ? q.list_id.trim() : "";
    const showPostCreateActions = q.created === "1";

    return renderAppContactsPage(ctx, {
      module,
      filters,
      contacts,
      lists,
      summary,
      wizardState,
      importPreview,
      editContact,
      assignContact,
      postCreateListId: postCreateListId || undefined,
      showPostCreateActions,
    });
  });
}

export async function getAppContactsImport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const ctx = await buildAppContext(req);
    if (!ctx) {
      res.redirect("/login?next=%2Fapp%2Fcontacts%2Fimport");
      return;
    }
    const jobId = typeof req.query.job === "string" ? req.query.job.trim() : "";
    if (jobId) {
      res.redirect(303, `/app/contacts?import_job=${encodeURIComponent(jobId)}`);
      return;
    }
    res.redirect(303, "/app/contacts?quick_wizard=import");
  } catch (error) {
    next(error);
  }
}

export async function postAppContactsImportPreview(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireContactsWriteContext(req);
    if (!ctx) {
      res.redirect("/app/contacts?quick_wizard=import&error=Sin%20permiso%20o%20empresa");
      return;
    }
    const body = req.body as Record<string, string | undefined>;
    const csvText = (body.csv_text ?? "").trim();
    const wizardListId = (body.wizard_list_id ?? "").trim();
    const importErrQs = new URLSearchParams({ quick_wizard: "import" });
    if (wizardListId) importErrQs.set("list_id", wizardListId);
    if (!csvText) {
      importErrQs.set("error", "El archivo o contenido está vacío.");
      res.redirect(303, `/app/contacts?${importErrQs.toString()}`);
      return;
    }
    const preview = await createContactImportJob(ctx.company.id, {
      csv_text: csvText,
      filename: body.filename,
      create_tags: body.create_tags === "1",
      default_list_name: body.default_list_name,
      default_list_id: wizardListId || undefined,
    });
    const qs = new URLSearchParams({
      import_job: preview.job.id,
      quick_wizard: "import",
    });
    if (wizardListId) qs.set("list_id", wizardListId);
    res.redirect(303, `/app/contacts?${qs.toString()}`);
  } catch (error) {
    const msg =
      error instanceof AppError ? error.message : "Error al previsualizar CSV";
    const body = req.body as Record<string, string | undefined>;
    const wizardListId = (body.wizard_list_id ?? "").trim();
    const errQs = new URLSearchParams({ quick_wizard: "import" });
    if (wizardListId) errQs.set("list_id", wizardListId);
    errQs.set("error", msg);
    res.redirect(303, `/app/contacts?${errQs.toString()}`);
  }
}

export async function postAppContactsImportConfirm(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireContactsWriteContext(req);
    if (!ctx) {
      res.redirect("/app/contacts?error=Sin%20permiso");
      return;
    }
    const jobId = (req.body as Record<string, string>).job_id ?? "";
    const result = await importValidatedContacts(ctx.company.id, jobId);
    const parts = [`${result.imported} contacto(s) importado(s).`];
    if (result.associated > 0) {
      parts.push(`${result.associated} duplicado(s) asociado(s) a la agenda.`);
    }
    if (result.skipped > 0) {
      parts.push(`${result.skipped} fila(s) omitida(s).`);
    }
    const extra =
      result.errors.length > 0
        ? ` Algunas filas tuvieron errores.`
        : "";
    res.redirect(
      303,
      `/app/contacts?ok=${encodeURIComponent(parts.join(" ") + extra)}`,
    );
  } catch (error) {
    const msg =
      error instanceof AppError ? error.message : "Error al importar contactos";
    res.redirect(303, `/app/contacts?error=${encodeURIComponent(msg)}`);
  }
}

export async function postAppCreateContactTag(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireContactsWriteContext(req);
    if (!ctx) {
      res.redirect("/app/contacts?error=Sin%20permiso");
      return;
    }
    const body = req.body as Record<string, string | undefined>;
    await createContactTag(ctx.company.id, {
      name: body.name ?? "",
      color: body.color,
    });
    res.redirect(303, "/app/contacts?ok=Tag%20creado%20correctamente");
  } catch (error) {
    const msg = error instanceof AppError ? error.message : "No se pudo crear el tag";
    res.redirect(
      303,
      `/app/contacts?error=${encodeURIComponent(msg)}&new=tag`,
    );
  }
}

export async function postAppBulkAssignTag(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireContactsWriteContext(req);
    if (!ctx) {
      res.redirect("/app/contacts?error=Sin%20permiso");
      return;
    }
    const body = req.body as Record<string, string | undefined>;
    const ids = parseContactIdsFromBody(body);
    const tagId = body.tag_id ?? "";
    const n = await bulkAssignTag(ctx.company.id, ids, tagId);
    res.redirect(
      303,
      `/app/contacts?ok=${encodeURIComponent(`Tag asignado a ${n} contacto(s).`)}`,
    );
  } catch (error) {
    const msg = error instanceof AppError ? error.message : "Error en acción masiva";
    res.redirect(303, `/app/contacts?error=${encodeURIComponent(msg)}`);
  }
}

export async function postAppBulkMoveList(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireContactsWriteContext(req);
    if (!ctx) {
      res.redirect("/app/contacts?error=Sin%20permiso");
      return;
    }
    const body = req.body as Record<string, string | undefined>;
    const ids = parseContactIdsFromBody(body);
    const listId = body.list_id ?? "";
    const n = await bulkMoveContactsToList(ctx.company.id, ids, listId);
    res.redirect(
      303,
      `/app/contacts?ok=${encodeURIComponent(`${n} contacto(s) movidos a la agenda.`)}`,
    );
  } catch (error) {
    const msg = error instanceof AppError ? error.message : "Error al mover contactos";
    res.redirect(303, `/app/contacts?error=${encodeURIComponent(msg)}`);
  }
}

export async function postAppBulkContactStatus(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireContactsWriteContext(req);
    if (!ctx) {
      res.redirect("/app/contacts?error=Sin%20permiso");
      return;
    }
    const body = req.body as Record<string, string | undefined>;
    const ids = parseContactIdsFromBody(body);
    const status = (body.status ?? "blocked") as ContactStatus;
    const n = await bulkUpdateContactStatus(ctx.company.id, ids, status);
    res.redirect(
      303,
      `/app/contacts?ok=${encodeURIComponent(`Estado actualizado en ${n} contacto(s).`)}`,
    );
  } catch (error) {
    const msg = error instanceof AppError ? error.message : "Error al cambiar estado";
    res.redirect(303, `/app/contacts?error=${encodeURIComponent(msg)}`);
  }
}

export async function postAppCreateContact(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as Record<string, string | undefined>;
  const filters = parseContactsFiltersFromBody(body);
  try {
    const ctx = await buildAppContext(req);
    if (!ctx) {
      res.redirect("/app/contacts?error=Empresa%20no%20asociada");
      return;
    }
    if (!canOperateClientPanel(ctx.profile.role)) {
      res.redirect(
        "/app/contacts?error=No%20tienes%20permiso%20para%20gestionar%20contactos",
      );
      return;
    }

    await createContact(ctx.company.id, {
      display_name: body.display_name,
      phone: body.phone ?? "",
      email: body.email,
      list_id: body.list_id,
      notes: body.notes,
      source: "manual",
    });

    const qs: Record<string, string | undefined> = {
      ok: "Contacto creado correctamente",
      created: "1",
    };
    if (body.list_id?.trim()) qs.list_id = body.list_id.trim();
    if (filters.q) qs.q = filters.q;
    if (filters.agenda) qs.agenda = filters.agenda;
    res.redirect(303, contactsRedirectPath(qs));
  } catch (error) {
    const msg =
      error instanceof AppError
        ? error.message
        : "No se pudo crear el contacto";
    res.redirect(
      303,
      contactsRedirectPath(
        {
          error: msg,
          quick_wizard: "contact",
          ...(body.list_id?.trim() ? { list_id: body.list_id.trim() } : {}),
        },
        filters,
      ),
    );
  }
}

export async function postAppCreateContactList(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await buildAppContext(req);
    if (!ctx) {
      res.redirect("/app/contacts?error=Empresa%20no%20asociada");
      return;
    }
    if (!canOperateClientPanel(ctx.profile.role)) {
      res.redirect(
        "/app/contacts?error=No%20tienes%20permiso%20para%20gestionar%20contactos",
      );
      return;
    }

    const body = req.body as Record<string, string | undefined>;
    const created = await createContactList(ctx.company.id, {
      name: body.name ?? "",
      description: body.description,
      color: body.color,
    });

    if (body.wizard_next === "1") {
      res.redirect(
        303,
        `/app/contacts?quick_wizard=choose&list_id=${encodeURIComponent(created.id)}`,
      );
      return;
    }

    res.redirect(303, "/app/contacts?ok=Agenda%20creada%20correctamente");
  } catch (error) {
    const msg =
      error instanceof AppError
        ? error.message
        : "No se pudo crear la agenda";
    res.redirect(
      303,
      `/app/contacts?error=${encodeURIComponent(msg)}&quick_wizard=agenda`,
    );
  }
}

export async function postAppDuplicateContactList(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireContactsWriteContext(req);
    if (!ctx) {
      res.redirect("/app/contacts?error=Sin%20permiso");
      return;
    }
    const listId = validateUuidParam(String(req.params.id), "id");
    await duplicateContactList(ctx.company.id, listId);
    res.redirect(303, "/app/contacts?ok=Agenda%20duplicada%20correctamente");
  } catch (error) {
    const msg =
      error instanceof AppError ? error.message : "No se pudo duplicar la agenda";
    res.redirect(303, `/app/contacts?error=${encodeURIComponent(msg)}`);
  }
}

export async function postAppDeleteContactList(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireContactsWriteContext(req);
    if (!ctx) {
      res.redirect("/app/contacts?error=Sin%20permiso");
      return;
    }
    const listId = validateUuidParam(String(req.params.id), "id");
    await archiveContactList(ctx.company.id, listId);
    res.redirect(303, "/app/contacts?ok=Agenda%20eliminada%20correctamente");
  } catch (error) {
    const msg =
      error instanceof AppError ? error.message : "No se pudo eliminar la agenda";
    res.redirect(303, `/app/contacts?error=${encodeURIComponent(msg)}`);
  }
}

export async function postAppUpdateContactList(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireContactsWriteContext(req);
    if (!ctx) {
      res.redirect("/app/contacts?error=Sin%20permiso");
      return;
    }
    const listId = validateUuidParam(String(req.params.id), "id");
    const body = req.body as Record<string, string | undefined>;
    const filters = parseContactsFiltersFromBody(body);
    await updateContactList(ctx.company.id, listId, {
      name: body.name,
      description: body.description,
      color: body.color,
    });
    res.redirect(
      303,
      contactsRedirectPath(
        { ok: "Agenda actualizada correctamente", agenda: listId },
        filters,
      ),
    );
  } catch (error) {
    const msg =
      error instanceof AppError ? error.message : "No se pudo actualizar la agenda";
    const body = req.body as Record<string, string | undefined>;
    const listId = String(req.params.id ?? "");
    res.redirect(
      303,
      contactsRedirectPath(
        {
          error: msg,
          quick_wizard: "edit_list",
          list_id: listId,
        },
        parseContactsFiltersFromBody(body),
      ),
    );
  }
}

export async function postAppUpdateContact(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireContactsWriteContext(req);
    if (!ctx) {
      res.redirect("/app/contacts?error=Sin%20permiso");
      return;
    }
    const contactId = validateUuidParam(String(req.params.id), "id");
    const body = req.body as Record<string, string | undefined>;
    const filters = parseContactsFiltersFromBody(body);
    await updateContact(ctx.company.id, contactId, {
      display_name: body.display_name,
      phone: body.phone,
      email: body.email,
      notes: body.notes,
      list_id: body.list_id?.trim() ? body.list_id : null,
    });
    res.redirect(
      303,
      contactsRedirectPath({ ok: "Contacto actualizado correctamente" }, filters),
    );
  } catch (error) {
    const msg =
      error instanceof AppError ? error.message : "No se pudo actualizar el contacto";
    const body = req.body as Record<string, string | undefined>;
    const contactId = String(req.params.id ?? "");
    res.redirect(
      303,
      contactsRedirectPath(
        { error: msg, edit_contact: contactId },
        parseContactsFiltersFromBody(body),
      ),
    );
  }
}

export async function postAppDeleteContact(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireContactsWriteContext(req);
    if (!ctx) {
      res.redirect("/app/contacts?error=Sin%20permiso");
      return;
    }
    const contactId = validateUuidParam(String(req.params.id), "id");
    const body = req.body as Record<string, string | undefined>;
    const filters = parseContactsFiltersFromBody(body);
    await deleteContact(ctx.company.id, contactId);
    res.redirect(
      303,
      contactsRedirectPath({ ok: "Contacto eliminado correctamente" }, filters),
    );
  } catch (error) {
    const msg =
      error instanceof AppError ? error.message : "No se pudo eliminar el contacto";
    res.redirect(303, `/app/contacts?error=${encodeURIComponent(msg)}`);
  }
}

export async function postAppAssignContactList(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireContactsWriteContext(req);
    if (!ctx) {
      res.redirect("/app/contacts?error=Sin%20permiso");
      return;
    }
    const contactId = validateUuidParam(String(req.params.id), "id");
    const body = req.body as Record<string, string | undefined>;
    const filters = parseContactsFiltersFromBody(body);
    const listId = (body.list_id ?? "").trim();
    if (!listId) {
      throw new AppError("Selecciona una agenda.", 400);
    }
    await setContactAgendaMembership(ctx.company.id, contactId, listId, {
      replaceOthers: body.replace_lists === "1",
    });
    res.redirect(
      303,
      contactsRedirectPath({ ok: "Agenda del contacto actualizada" }, filters),
    );
  } catch (error) {
    const msg =
      error instanceof AppError ? error.message : "No se pudo asignar la agenda";
    const body = req.body as Record<string, string | undefined>;
    const contactId = String(req.params.id ?? "");
    res.redirect(
      303,
      contactsRedirectPath(
        { error: msg, assign_contact: contactId },
        parseContactsFiltersFromBody(body),
      ),
    );
  }
}

export async function getAppReports(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const filters = parseDlrReportFilters(
      req.query as Record<string, string | string[] | undefined>,
    );
    const result = await queryDlrReport(
      ctx.company.id,
      ctx.company.name,
      filters,
    );
    return renderAppReportsPage(ctx, result, filters);
  });
}

export async function getAppReportsExportCsv(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await buildAppContext(req);
    if (!ctx) {
      res.status(401).send("No autorizado");
      return;
    }
    const filters = parseDlrReportFilters(
      req.query as Record<string, string | string[] | undefined>,
    );
    filters.page = 1;
    filters.pageSize = 5000;
    const result = await queryDlrReport(
      ctx.company.id,
      ctx.company.name,
      filters,
    );
    const csv = dlrReportRowsToCsv(result.rows);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="dlr-report-${stamp}.csv"`,
    );
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error al exportar";
    res.status(500).send(msg);
  }
}

export async function getAppInvoices(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const filters = parseAppInvoiceFilters(
      req.query as Record<string, string | string[] | undefined>,
    );

    const missingInvoices = await findPaidCreditedOrdersWithoutInvoice({
      companyId: ctx.company.id,
      limit: 30,
    });
    for (const row of missingInvoices) {
      await runBillingSyncBestEffort(row.order_id, {
        source: "client_invoices_page",
      });
    }

    const invoices = await listCompanyInvoices(ctx.company.id, {
      status: filters.status,
      documentType: filters.documentType,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      search: filters.search,
      limit: 200,
    });

    const orderById = new Map<string, SmsOrderRow>();
    const orderIds = [...new Set(invoices.map((i) => i.order_id))];
    await Promise.all(
      orderIds.map(async (orderId) => {
        const order = await getOrderById(orderId);
        if (order && order.company_id === ctx.company.id) {
          orderById.set(orderId, order);
        }
      }),
    );

    const summary = summarizeCompanyInvoices(invoices);

    return renderAppInvoicesPage(ctx, {
      invoices,
      filters,
      summary,
      orderById,
    });
  });
}

export async function getAppInvoiceDetail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const invoiceId = validateUuidParam(String(req.params.id), "id");
    const invoice = await getCompanyInvoiceById(ctx.company.id, invoiceId);
    if (!invoice) {
      return renderAppInvoiceNotFoundPage(ctx);
    }

    let order = await getOrderById(invoice.order_id);
    if (order && order.company_id !== ctx.company.id) {
      order = null;
    }

    return renderAppInvoiceDetailPage(ctx, invoice, order);
  });
}

export async function getAppInvoicePreview(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await buildAppContext(req);
    if (!ctx) {
      res.status(401).type("html").send("<p>No autorizado.</p>");
      return;
    }

    const invoiceId = validateUuidParam(String(req.params.id), "id");
    const invoice = await getCompanyInvoiceById(ctx.company.id, invoiceId);
    if (!invoice) {
      res
        .status(404)
        .type("html")
        .send(
          "<!DOCTYPE html><html lang=\"es\"><body style=\"font-family:system-ui;padding:2rem\"><h1>Comprobante no encontrado</h1><p>El documento no existe o no pertenece a tu empresa.</p><p><a href=\"/app/invoices\">Volver a facturación</a></p></body></html>",
        );
      return;
    }

    let order = await getOrderById(invoice.order_id);
    if (order && order.company_id !== ctx.company.id) {
      order = null;
    }

    const html = generateInvoiceHtmlFromData(
      sanitizeInvoiceDocumentData({
        invoice,
        company: ctx.company,
        order,
      }),
    );

    res.type("html").send(html);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error al generar comprobante";
    res.status(500).type("html").send(`<p>${escapeHtml(msg)}</p>`);
  }
}

export async function getAppManual(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, (ctx) => renderAppManualPage(ctx));
}

export async function getAppManualPdf(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const ctx = await buildAppContext(req);
    if (!ctx) {
      res.redirect("/login?next=%2Fapp%2Fsupport%2Fmanual.pdf");
      return;
    }
    const pdf = await generateClientPanelManualPdf();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="telvoice-manual-panel-cliente.pdf"',
    );
    res.send(pdf);
  } catch (error) {
    next(error);
  }
}

export async function getAppSupport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    let relatedOrder = null;
    const orderParam = req.query.order;
    if (typeof orderParam === "string" && orderParam.trim()) {
      try {
        const orderId = validateUuidParam(orderParam.trim(), "order");
        relatedOrder = await getOrderWithDetailsForCompany(
          orderId,
          ctx.company.id,
        );
      } catch {
        relatedOrder = null;
      }
    }

    const module = await getSupportTicketsModuleState();
    let tickets: SupportTicket[] = [];

    if (module.available && ctx.company.id) {
      const listed = await listSupportTickets(ctx.company.id);
      if (listed.ok) {
        tickets = listed.data;
      }
    }

    const suggestedSubject = relatedOrder
      ? `Consulta sobre orden ${relatedOrder.payment_reference ?? relatedOrder.id.slice(0, 8)}`
      : undefined;

    return renderAppSupportPage(ctx, relatedOrder, {
      module,
      tickets,
      relatedOrderId: relatedOrder?.id ?? null,
      suggestedSubject,
    });
  });
}

const SUPPORT_PRIORITIES = new Set<SupportTicketPriority>([
  "low",
  "medium",
  "high",
  "urgent",
]);

function parseSupportPriority(raw: unknown): SupportTicketPriority {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (SUPPORT_PRIORITIES.has(value as SupportTicketPriority)) {
    return value as SupportTicketPriority;
  }
  return "medium";
}

async function requireSupportWriteContext(
  req: Request,
): Promise<AppPageContext | null> {
  const ctx = await buildAppContext(req);
  if (!ctx) return null;
  if (!canOperateClientPanel(ctx.profile.role)) return null;
  return ctx;
}

export async function postAppSupportTicket(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireSupportWriteContext(req);
    if (!ctx) {
      res.status(403).json({ ok: false, error: "Sin permiso o empresa no asociada." });
      return;
    }

    const module = await getSupportTicketsModuleState();
    if (!module.available) {
      res.status(503).json({
        ok: false,
        error: "Backend de tickets no disponible.",
        missingTable: module.migrationPending,
      });
      return;
    }

    const body = req.body as Record<string, unknown>;
    let relatedOrderId: string | null = null;
    if (typeof body.relatedOrderId === "string" && body.relatedOrderId.trim()) {
      try {
        relatedOrderId = validateUuidParam(body.relatedOrderId.trim(), "order");
      } catch {
        relatedOrderId = null;
      }
    }

    const result = await createSupportTicket({
      companyId: ctx.company.id,
      userId: ctx.profile.authUserId ?? ctx.profile.profileId,
      subject: typeof body.subject === "string" ? body.subject : "",
      category: typeof body.category === "string" ? body.category : "Otro",
      priority: parseSupportPriority(body.priority),
      message: typeof body.message === "string" ? body.message : "",
      relatedOrderId,
    });

    if (!result.ok) {
      res.status(result.missingTable ? 503 : 400).json(result);
      return;
    }

    res.json({ ok: true, ticket: result.data });
  } catch (error) {
    const msg =
      error instanceof AppError ? error.message : "No se pudo crear el ticket.";
    res.status(500).json({ ok: false, error: msg });
  }
}

export async function postAppSupportTicketReply(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireSupportWriteContext(req);
    if (!ctx) {
      res.status(403).json({ ok: false, error: "Sin permiso o empresa no asociada." });
      return;
    }

    const ticketId = validateUuidParam(String(req.params.id ?? ""), "ticket");
    const body = req.body as Record<string, unknown>;
    const message = typeof body.message === "string" ? body.message : "";

    const result = await addSupportTicketReply(ticketId, ctx.company.id, {
      message,
      author: "client",
    });

    if (!result.ok) {
      res.status(result.missingTable ? 503 : 400).json(result);
      return;
    }

    res.json({ ok: true, ticket: result.data });
  } catch (error) {
    const msg =
      error instanceof AppError ? error.message : "No se pudo enviar la respuesta.";
    res.status(500).json({ ok: false, error: msg });
  }
}

export async function postAppSupportTicketResolve(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await requireSupportWriteContext(req);
    if (!ctx) {
      res.status(403).json({ ok: false, error: "Sin permiso o empresa no asociada." });
      return;
    }

    const ticketId = validateUuidParam(String(req.params.id ?? ""), "ticket");
    const result = await markSupportTicketResolved(ticketId, ctx.company.id);

    if (!result.ok) {
      res.status(result.missingTable ? 503 : 400).json(result);
      return;
    }

    res.json({ ok: true, ticket: result.data });
  } catch (error) {
    const msg =
      error instanceof AppError
        ? error.message
        : "No se pudo marcar el ticket como resuelto.";
    res.status(500).json({ ok: false, error: msg });
  }
}
