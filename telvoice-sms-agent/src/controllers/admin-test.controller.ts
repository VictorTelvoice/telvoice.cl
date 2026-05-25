import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { listCompanies } from "../services/companyService.js";
import {
  getSendControlPanelView,
  resolveVerifyTestSend,
} from "../services/smsSendControlPanelService.js";
import { sendPanelSms } from "../services/smsSendService.js";
import {
  buildTelsimVerifyLinesPreview,
  listTelsimInboundFeedForVerifyEntry,
} from "../services/telsimWebhookService.js";
import { getRegisteredVerifyNumbers } from "../config/verifyNumbers.js";
import { canCompanyUseLiveTestUi } from "../services/smsProviderStatusService.js";
import { AppError } from "../utils/errors.js";
import { renderAdminTestPage } from "../views/admin-ui/sections/test-page.js";

async function resolveAdminTestCompanyId(): Promise<string> {
  const allowed = env.smsProvider.liveTestAllowedCompanyIds;
  if (allowed.length > 0) {
    return allowed[0]!;
  }
  const companies = await listCompanies(20);
  const active = companies.find((c) => c.status === "active");
  if (!active) {
    throw new AppError(
      "No hay empresa activa para pruebas telsim. Configura SMS_LIVE_TEST_ALLOWED_COMPANY_IDS.",
      503,
    );
  }
  return active.id;
}

export async function getAdminTestPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const companyId = await resolveAdminTestCompanyId();
    const sendEnabled = canCompanyUseLiveTestUi(companyId);
    const panel = sendEnabled ? await getSendControlPanelView(companyId) : null;
    const verifyEntries = getRegisteredVerifyNumbers();
    const lineFeeds: Record<string, Awaited<ReturnType<typeof listTelsimInboundFeedForVerifyEntry>>> = {};
    if (verifyEntries.length > 0) {
      const feeds = await Promise.all(
        verifyEntries.map(async (entry) => ({
          id: entry.id,
          messages: await listTelsimInboundFeedForVerifyEntry(entry),
        })),
      );
      for (const f of feeds) {
        lineFeeds[f.id] = f.messages;
      }
    }
    const flash =
      typeof req.query.ok === "string" ? req.query.ok : undefined;
    const error =
      typeof req.query.error === "string" ? req.query.error : undefined;

    res.type("html").send(
      renderAdminTestPage({
        admin: req.adminUser!,
        panel,
        sendEnabled,
        lineFeeds,
        flash,
        error,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getAdminTelsimInboundPreview(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const entries = getRegisteredVerifyNumbers();
    const lines = await buildTelsimVerifyLinesPreview(entries);
    res.status(200).json({ ok: true, lines });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error interno";
    res.status(500).json({ ok: false, error: msg });
  }
}

export async function postAdminTestQaSend(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const companyId = await resolveAdminTestCompanyId();
    if (!canCompanyUseLiveTestUi(companyId)) {
      res.redirect(
        "/admin/test?error=" +
          encodeURIComponent("Envío live_test no habilitado para la empresa de prueba."),
      );
      return;
    }

    const recipientMode =
      typeof req.body?.recipient_mode === "string"
        ? req.body.recipient_mode.trim()
        : "line";
    const verifyId =
      recipientMode !== "custom" &&
      typeof req.body?.verify_id === "string"
        ? req.body.verify_id.trim()
        : "";
    const customTo =
      recipientMode === "custom" && typeof req.body?.to === "string"
        ? req.body.to.trim()
        : "";
    const resolved = resolveVerifyTestSend({
      verifyId: verifyId || undefined,
      to: customTo || undefined,
      message: req.body?.message,
    });
    if (!resolved) {
      res.redirect(
        "/admin/test?error=" +
          encodeURIComponent("Número de verificación no encontrado."),
      );
      return;
    }

    const result = await sendPanelSms({
      companyId,
      senderId: String(req.body?.sender_id ?? "TELVOICE"),
      to: resolved.to,
      message: resolved.message,
      campaignName: `QA Verify — ${resolved.label}`,
      createdBy: req.adminUser?.profileId ?? req.adminUser?.id ?? undefined,
      sendSource: "app_send_sms_verify_test",
    });

    res.redirect(
      "/admin/test?ok=" +
        encodeURIComponent(
          `Test QA enviado a ${result.recipientNumber}. Estado: ${result.status}.`,
        ),
    );
  } catch (error) {
    const msg =
      error instanceof AppError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudo enviar el test QA";
    res.redirect(`/admin/test?error=${encodeURIComponent(msg)}`);
  }
}
