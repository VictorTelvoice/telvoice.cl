import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import {
  renderAdminCampaignSendPage,
  type AdminCampaignSendMode,
} from "../views/admin-ui/sections/admin-campaign-send-page.js";
import { listCompanies, findCompanyById } from "../services/companyService.js";
import { getCompanyBalance } from "../services/smsWalletService.js";
import { sendPanelCampaign } from "../services/smsPanelCampaignSendService.js";
import type { PanelCampaignSendResult } from "../types/sms-panel.js";
import { parseMassCampaignRowsJson } from "../utils/csvMassCampaign.js";
import { suggestSenderIdFromCompanyName } from "../utils/suggestSenderId.js";
import {
  APP_SCHEDULE_TIMEZONE,
  buildScheduledIsoInTimeZone,
  formatScheduleInTimeZone,
  isScheduleAtLeastMinutesAhead,
} from "../utils/scheduleTime.js";
import { AppError } from "../utils/errors.js";

function parseMode(raw: string | undefined): AdminCampaignSendMode {
  return raw === "scheduled" ? "scheduled" : "mass";
}

function collectMassRows(req: Request): {
  rows: { phone: string; message: string }[];
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
  return { rows: [], defaultMessage, hasPerRowMessages: false };
}

function campaignFlash(
  result: PanelCampaignSendResult,
  sendMode: AdminCampaignSendMode,
): string {
  if (result.queued > 0 && result.sent === 0) {
    const when =
      sendMode === "scheduled" && result.scheduledAt
        ? ` para ${formatScheduleInTimeZone(result.scheduledAt, APP_SCHEDULE_TIMEZONE)}`
        : "";
    const failNote =
      result.failed > 0 ? ` (${result.failed} filas no encoladas)` : "";
    return `Campaña «${result.campaignName}»: ${result.queued} mensaje(s) en cola${when}. Despacho en segundo plano.${failNote}`;
  }
  if (sendMode === "scheduled" && result.scheduledAt) {
    const when = formatScheduleInTimeZone(
      result.scheduledAt,
      APP_SCHEDULE_TIMEZONE,
    );
    return `Programado ${when}: ${result.sent} enviado(s), ${result.failed} fallido(s). Campaña «${result.campaignName}».`;
  }
  return `Campaña «${result.campaignName}»: ${result.sent} enviado(s), ${result.failed} fallido(s), ${result.smsConsumed} SMS consumidos.`;
}

async function loadPageContext(req: Request) {
  const companies = await listCompanies(300);
  const companyId = String(
    req.body?.company_id ?? req.query.company_id ?? "",
  ).trim();
  const selectedCompany = companyId
    ? await findCompanyById(companyId)
    : null;
  let availSms = 0;
  if (selectedCompany) {
    const bal = await getCompanyBalance(selectedCompany.id);
    availSms = bal.availableSms;
  }
  const activeMode = parseMode(
    String(req.body?.send_mode ?? req.query.mode ?? "mass"),
  );
  return { companies, companyId, selectedCompany, availSms, activeMode };
}

export async function getAdminCampaignSendPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const ctx = await loadPageContext(req);
    const flash =
      typeof req.query.ok === "string" ? req.query.ok : undefined;
    const error =
      typeof req.query.error === "string" ? req.query.error : undefined;

    res.type("html").send(
      renderAdminCampaignSendPage({
        admin: req.adminUser!,
        companies: ctx.companies,
        selectedCompanyId: ctx.companyId || undefined,
        selectedCompany: ctx.selectedCompany,
        availSms: ctx.availSms,
        activeMode: ctx.activeMode,
        idempotencyKey: randomUUID(),
        flash,
        error,
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function postAdminCampaignSend(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const sendMode = parseMode(String(req.body?.send_mode ?? "mass"));
    const companyId = String(req.body?.company_id ?? "").trim();
    if (!companyId) {
      throw new AppError("Selecciona un cliente.", 400);
    }
    const company = await findCompanyById(companyId);
    if (!company) {
      throw new AppError("Cliente no encontrado.", 404);
    }

    const massPayload = collectMassRows(req);
    if (massPayload.rows.length === 0) {
      throw new AppError(
        sendMode === "scheduled"
          ? "Sube un CSV con destinatarios válidos antes de programar."
          : "Sube un CSV con al menos un destinatario válido.",
        400,
      );
    }
    if (!massPayload.hasPerRowMessages && !massPayload.defaultMessage) {
      throw new AppError(
        "Indica un mensaje común o un CSV con columnas número y mensaje.",
        400,
      );
    }

    const senderId = String(
      req.body?.sender_id ?? suggestSenderIdFromCompanyName(company.name),
    ).trim();
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

    const idempotencyKey =
      String(req.body?.idempotency_key ?? "").trim() || randomUUID();

    const result = await sendPanelCampaign({
      companyId: company.id,
      senderId,
      message: massPayload.defaultMessage,
      rows: massPayload.rows,
      campaignName,
      mode: sendMode,
      scheduledAt,
      createdBy: req.adminUser?.id,
      sendSource: `admin_campaign_${sendMode}`,
      idempotencyKey,
    });

    const ok = encodeURIComponent(campaignFlash(result, sendMode));
    res.redirect(
      303,
      `/admin/campaigns/send?company_id=${encodeURIComponent(company.id)}&mode=${sendMode}&ok=${ok}`,
    );
  } catch (err) {
    if (err instanceof AppError) {
      try {
        const ctx = await loadPageContext(req);
        res.status(err.statusCode).type("html").send(
          renderAdminCampaignSendPage({
            admin: req.adminUser!,
            companies: ctx.companies,
            selectedCompanyId: ctx.companyId || undefined,
            selectedCompany: ctx.selectedCompany,
            availSms: ctx.availSms,
            activeMode: ctx.activeMode,
            idempotencyKey:
              String(req.body?.idempotency_key ?? "").trim() || randomUUID(),
            error: err.message,
            formValues: {
              campaign_name: String(req.body?.campaign_name ?? ""),
              sender_id: String(req.body?.sender_id ?? ""),
              message: String(req.body?.message ?? ""),
              schedule_date: String(req.body?.schedule_date ?? ""),
              schedule_time: String(req.body?.schedule_time ?? ""),
            },
          }),
        );
        return;
      } catch {
        /* fall through */
      }
    }
    next(err);
  }
}
