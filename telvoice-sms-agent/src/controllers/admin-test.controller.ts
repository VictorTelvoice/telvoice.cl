import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { listCompanies } from "../services/companyService.js";
import {
  getSendControlPanelView,
  resolveVerifyTestSend,
} from "../services/smsSendControlPanelService.js";
import { sendPanelSms } from "../services/smsSendService.js";
import { getSmsProviderById, listSmsProviders } from "../services/smsProviderService.js";
import { listSmsRoutes } from "../services/smsRouteService.js";
import { sendSuperadminProviderTest } from "../services/superadminProviderTestService.js";
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

function wantsJsonResponse(req: Request): boolean {
  const accept = req.get("Accept") ?? "";
  return accept.includes("application/json");
}

function respondTestSendResult(
  req: Request,
  res: Response,
  payload: { ok: boolean; message: string; status?: string; recipient?: string },
  statusCode = 200,
): void {
  if (wantsJsonResponse(req)) {
    res.status(statusCode).json(payload);
    return;
  }
  const key = payload.ok ? "ok" : "error";
  res.redirect(`/admin/test?${key}=${encodeURIComponent(payload.message)}`);
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
    const lineFeeds: Record<
      string,
      Awaited<ReturnType<typeof listTelsimInboundFeedForVerifyEntry>>
    > = {};
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

    const [providers, routes] = await Promise.all([
      listSmsProviders(),
      listSmsRoutes(),
    ]);

    res.type("html").send(
      renderAdminTestPage({
        admin: req.adminUser!,
        panel,
        sendEnabled,
        lineFeeds,
        providers: providers.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          status: p.status,
          defaultSenderId: p.default_sender_id,
        })),
        routes: routes.map((r) => ({
          id: r.id,
          providerId: r.provider_id,
          name: r.name,
          country: r.country,
          status: r.status,
          isDefault: r.is_default,
          providerName: r.provider_name ?? r.provider_code ?? "",
        })),
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
      respondTestSendResult(
        req,
        res,
        {
          ok: false,
          message: "Envío live_test no habilitado para la empresa de prueba.",
        },
        403,
      );
      return;
    }

    const messageRaw =
      typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!messageRaw) {
      respondTestSendResult(
        req,
        res,
        { ok: false, message: "Escribe un mensaje para enviar." },
        400,
      );
      return;
    }

    const recipientMode =
      typeof req.body?.recipient_mode === "string"
        ? req.body.recipient_mode.trim()
        : "line";
    const sendLineIndexRaw =
      typeof req.body?.send_line_index === "string"
        ? req.body.send_line_index.trim()
        : "";
    const sendLineIndex =
      sendLineIndexRaw !== "" ? Number.parseInt(sendLineIndexRaw, 10) : NaN;
    const verifyId =
      recipientMode !== "custom" &&
      typeof req.body?.verify_id === "string"
        ? req.body.verify_id.trim()
        : "";
    const customTo =
      recipientMode === "custom" && typeof req.body?.to === "string"
        ? req.body.to.trim()
        : "";
    const resolved =
      recipientMode === "custom"
        ? resolveVerifyTestSend({
            to: customTo || undefined,
            message: messageRaw,
            requireMessage: true,
          })
        : resolveVerifyTestSend({
            verifyId: verifyId || undefined,
            sendLineIndex: Number.isFinite(sendLineIndex)
              ? sendLineIndex
              : undefined,
            message: messageRaw,
            requireMessage: true,
          });
    if (!resolved) {
      respondTestSendResult(
        req,
        res,
        {
          ok: false,
          message:
            recipientMode === "custom"
              ? "Indica un número destino válido."
              : "Selecciona una línea de verificación registrada.",
        },
        400,
      );
      return;
    }

    const senderId = String(req.body?.sender_id ?? "TELVOICE");
    const message = resolved.message;
    const routeMode =
      typeof req.body?.route_mode === "string"
        ? req.body.route_mode.trim()
        : "auto";
    const providerId =
      typeof req.body?.provider_id === "string"
        ? req.body.provider_id.trim()
        : "";
    const routeId =
      typeof req.body?.route_id === "string" ? req.body.route_id.trim() : "";

    if (routeMode === "manual") {
      if (!providerId || !routeId) {
        respondTestSendResult(
          req,
          res,
          { ok: false, message: "Selecciona proveedor y ruta para el envío manual." },
          400,
        );
        return;
      }
      const provider = await getSmsProviderById(providerId);
      if (!provider) {
        respondTestSendResult(
          req,
          res,
          { ok: false, message: "Proveedor no encontrado." },
          404,
        );
        return;
      }
      const result = await sendSuperadminProviderTest({
        provider,
        routeId,
        to: resolved.to,
        senderId,
        message,
      });
      if (!result.accepted) {
        respondTestSendResult(
          req,
          res,
          {
            ok: false,
            message:
              result.errorMessage ??
              "El proveedor rechazó el envío de prueba.",
            status: result.status,
            recipient: resolved.to,
          },
          502,
        );
        return;
      }
      respondTestSendResult(req, res, {
        ok: true,
        message: `SMS enviado vía ${provider.name} → ${resolved.to}. Estado: ${result.status}.`,
        status: result.status,
        recipient: resolved.to,
      });
      return;
    }

    const result = await sendPanelSms({
      companyId,
      senderId,
      to: resolved.to,
      message,
      campaignName: `QA Verify — ${resolved.label}`,
      createdBy: req.adminUser?.profileId ?? req.adminUser?.id ?? undefined,
      sendSource: "app_send_sms_verify_test",
      skipInterSendCooldown: true,
    });

    respondTestSendResult(req, res, {
      ok: true,
      message: `SMS enviado a ${result.recipientNumber}. Estado: ${result.status}.`,
      status: result.status,
      recipient: result.recipientNumber,
    });
  } catch (error) {
    const msg =
      error instanceof AppError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudo enviar el test QA";
    respondTestSendResult(req, res, { ok: false, message: msg }, 400);
  }
}
