import type { NextFunction, Request, Response } from "express";
import { canOperateClientPanel } from "../types/roles.js";
import {
  getClientCatalogPackages,
  getClientDashboardData,
} from "../services/clientDashboardService.js";
import { findCompanyById } from "../services/companyService.js";
import {
  createOrder,
  getOrderWithDetailsForCompany,
  listSmsOrdersByCompany,
} from "../services/smsOrderService.js";
import { getCompanyBalance } from "../services/smsWalletService.js";
import { listTransactionsByCompany } from "../services/walletTransactionService.js";
import { isMercadoPagoConfigured } from "../config/env.js";
import { parseOrderListFilter } from "../utils/order-display.js";
import { validateUuidParam } from "../utils/validation.js";
import type { AppPageContext } from "../views/app-ui/app-page-wrap.js";
import {
  renderNoCompanyPage,
} from "../views/app-ui/app-page-wrap.js";
import {
  renderAppDashboardPage,
  renderAppWalletPage,
} from "../views/app-ui/app-pages.js";
import {
  renderAppCampaignsPage,
  renderAppInboxPage,
  renderAppReportsPage,
  renderAppSendSmsPage,
} from "../views/app-ui/app-sms-pages.js";
import {
  renderAppBuySmsPage,
  renderAppOrderDetailPage,
  renderAppOrderNotFoundPage,
  renderAppOrdersPage,
} from "../views/app-ui/app-order-pages.js";
import {
  renderAppApiPage,
  renderAppContactsPage,
  renderAppInvoicesPage,
  renderAppSettingsPage,
  renderAppSupportPage,
  renderAppTemplatesPage,
} from "../views/app-ui/app-section-pages.js";
import {
  getCampaignByIdForCompany,
  listCampaignsByCompany,
} from "../services/smsCampaignService.js";
import { getPanelSmsMessageById } from "../services/panelSmsMessageService.js";
import type {
  MockSmsSendResult,
  PanelCampaignSendResult,
} from "../types/sms-panel.js";
import {
  sendPanelCampaign,
  type MassCampaignSendRow,
} from "../services/smsPanelCampaignSendService.js";
import { parseMassCampaignRowsJson } from "../utils/csvMassCampaign.js";
import { MOCK_CONTACT_LISTS } from "../views/admin-ui/mock-data-stage3.js";
import { listPanelMessagesByCompany } from "../services/panelSmsMessageService.js";
import { getClientSmsReportData } from "../services/smsPanelReportsService.js";
import { getLiveTestSendPageStatus } from "../services/smsLiveTestLimiterService.js";
import { canCompanyUseLiveTestUi } from "../services/smsProviderStatusService.js";
import {
  getSendControlPanelView,
  resolveVerifyTestSend,
} from "../services/smsSendControlPanelService.js";
import { buildTelsimVerifyLinesPreview } from "../services/telsimWebhookService.js";
import { getRegisteredVerifyNumbers } from "../config/verifyNumbers.js";
import { sendPanelSms } from "../services/smsSendService.js";
import {
  beginSendSmsIdempotency,
  completeSendSmsIdempotency,
  failSendSmsIdempotency,
  issueSendSmsIdempotencyKey,
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
  if (sendMode !== "mass" && sendMode !== "scheduled") {
    return null;
  }

  const massPayload = collectMassCampaignRows(req);
  if (massPayload.rows.length === 0) {
    throw new AppError(
      sendMode === "scheduled"
        ? "Agrega destinatarios con lista, CSV o archivo con columnas número y mensaje."
        : "Agrega al menos un destinatario válido (lista o CSV).",
      400,
    );
  }

  if (!massPayload.hasPerRowMessages && !massPayload.defaultMessage) {
    throw new AppError(
      "Indica un mensaje común o sube un CSV con columnas número y mensaje.",
      400,
    );
  }

  const senderId = String(req.body?.sender_id ?? "TELVOICE").trim();
  const campaignName =
    String(req.body?.campaign_name ?? "").trim() ||
    (sendMode === "scheduled" ? "Envío programado" : "Campaña masiva");

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
    mode: sendMode,
    scheduledAt,
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
  if (sendMode === "scheduled" && result.scheduledAt) {
    const when = formatScheduleCl(result.scheduledAt);
    if (result.queued > 0 && result.sent === 0) {
      return `Envío programado para ${when}: ${result.queued} mensaje(s) en cola. Campaña «${result.campaignName}».`;
    }
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
          sendMode: "live_test",
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

async function buildAppContext(req: Request): Promise<AppPageContext | null> {
  const profile = req.userProfile;
  if (!profile?.companyId) {
    return null;
  }

  const company = await findCompanyById(profile.companyId);
  if (!company) {
    return null;
  }

  const balance = await getCompanyBalance(profile.companyId);
  return {
    profile,
    company,
    balance,
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
        res.redirect("/admin/login?next=%2Fapp");
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
    const data = await getClientDashboardData(ctx.company.id);
    return renderAppDashboardPage(ctx, data);
  });
}

export async function getAppBuySms(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const packages = await getClientCatalogPackages(ctx.company.country);
    return renderAppBuySmsPage(ctx, packages, isMercadoPagoConfigured());
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

    const packageId = validateUuidParam(
      String(req.body?.package_id ?? ""),
      "package_id",
    );

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
    const transactions = await listTransactionsByCompany(ctx.company.id, 50);
    return renderAppWalletPage(ctx, transactions);
  });
}

export async function getAppOrders(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const orders = await listSmsOrdersByCompany(ctx.company.id, 100);
    const filter = parseOrderListFilter(
      typeof req.query.filter === "string" ? req.query.filter : undefined,
    );
    return renderAppOrdersPage(ctx, orders, filter);
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
    if (!order) {
      return renderAppOrderNotFoundPage(ctx);
    }
    const showCreatedBanner = req.query.created === "1";
    return renderAppOrderDetailPage(ctx, order, {
      showCreatedBanner: showCreatedBanner,
    });
  });
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
    const liveTestStatus = sendEnabled
      ? await getLiveTestSendPageStatus(ctx.company.id)
      : null;
    const controlPanel = sendEnabled
      ? await getSendControlPanelView(ctx.company.id)
      : null;
    const { flash: okFlash, error: errFlash } = flash(req);
    const outcome = await loadSendOutcomeFromQuery(req, ctx.company.id);
    const idempotencyKey = sendEnabled
      ? await issueSendSmsIdempotencyKey(
          ctx.company.id,
          ctx.profile.profileId ?? ctx.profile.adminUserId ?? null,
        )
      : undefined;
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
    });
  });
}

export async function getAppTelsimInboundPreview(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ctx = await buildAppContext(req);
    if (!ctx) {
      res.status(401).json({ ok: false, error: "No autorizado" });
      return;
    }
    const entries = getRegisteredVerifyNumbers();
    const lines = await buildTelsimVerifyLinesPreview(entries);
    res.status(200).json({ ok: true, lines });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error interno";
    res.status(500).json({ ok: false, error: msg });
  }
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

    const claim = await beginSendSmsIdempotency(companyId, idempotencyKey);
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

    const result = await sendPanelSms({
      companyId: ctx.company.id,
      senderId: String(req.body?.sender_id ?? "TELVOICE"),
      to,
      message,
      campaignName,
      createdBy:
        ctx.profile.profileId ?? ctx.profile.adminUserId ?? undefined,
      sendSource: isVerifyTest
        ? "app_send_sms_verify_test"
        : "app_send_sms_live_test",
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

export async function getAppCampaigns(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const campaigns = await listCampaignsByCompany(ctx.company.id, 100);
    return renderAppCampaignsPage(ctx, campaigns);
  });
}

export async function getAppInbox(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const messages = await listPanelMessagesByCompany(ctx.company.id, 100);
    return renderAppInboxPage(ctx, messages);
  });
}

export async function getAppContacts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, (ctx) => renderAppContactsPage(ctx));
}

export async function getAppTemplates(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, (ctx) => renderAppTemplatesPage(ctx));
}

export async function getAppReports(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const report = await getClientSmsReportData(ctx.company.id);
    return renderAppReportsPage(ctx, report);
  });
}

export async function getAppInvoices(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, (ctx) => renderAppInvoicesPage(ctx));
}

export async function getAppApi(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, (ctx) => renderAppApiPage(ctx));
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
    return renderAppSupportPage(ctx, relatedOrder);
  });
}

export async function getAppSettings(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, (ctx) => renderAppSettingsPage(ctx));
}
