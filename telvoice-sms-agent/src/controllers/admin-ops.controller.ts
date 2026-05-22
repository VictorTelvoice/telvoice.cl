import type { NextFunction, Request, Response } from "express";
import {
  creditManualBalance,
  getBalanceByClientId,
  listBalanceLedgerForClient,
} from "../services/balanceService.js";
import {
  checkKnowledgeTableAvailable,
  countActiveKnowledgeArticles,
  listKnowledgeArticles,
} from "../services/knowledgeService.js";
import { listTelegramUsersByClientId } from "../services/clientTelegramUserService.js";
import { getOrCreateTestClient } from "../services/clientService.js";
import { fetchTelegramBotInfoForDiagnostics } from "../services/telegramPolling.js";
import { getTelegramRuntimeStatus } from "../services/telegram/runtime.js";
import {
  sendTelegramTestToChatId,
  TELEGRAM_CONNECTION_TEST_MESSAGE,
} from "../services/telegramTestService.js";
import { fetchPublicIp } from "../utils/public-ip.js";
import {
  fetchAsmscBalance,
  sendTestSms,
  simulateDeliveredDlrForMessage,
  simulateFailedDlrForMessage,
} from "../services/sms.service.js";
import { isProduction } from "../config/env.js";
import { AppError, ValidationError } from "../utils/errors.js";
import { validateUuidParam } from "../utils/validation.js";
import {
  simulateTelegramIntent,
  TELEGRAM_INTENT_TEST_CASES,
} from "../services/telegramIntentService.js";
import {
  renderAsmscBalancePage,
  renderAsmscDiagnosticsPage,
  renderCreditFormPage,
  renderLedgerPage,
  renderTelegramDiagnosticsPage,
  renderTelegramIntentTestPage,
  renderSendTestFormPage,
  renderSendTestResultPage,
  type SendTestFormValues,
} from "../views/admin-pages.js";

export function getSendTestForm(req: Request, res: Response): void {
  const error =
    typeof req.query.error === "string" ? req.query.error : undefined;

  res.type("html").send(
    renderSendTestFormPage({
      admin: req.adminUser!,
      error,
    }),
  );
}

export async function postSendTest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const formValues: SendTestFormValues = {
    phonenumber: String(req.body?.phonenumber ?? ""),
    textmessage: String(req.body?.textmessage ?? ""),
    sender_id: String(req.body?.sender_id ?? ""),
    sms_type: String(req.body?.sms_type ?? "T"),
    encoding: String(req.body?.encoding ?? "T"),
  };

  try {
    const result = await sendTestSms(formValues);

    res.type("html").send(
      renderSendTestResultPage({
        admin: req.adminUser!,
        result,
      }),
    );
  } catch (error) {
    if (error instanceof ValidationError || error instanceof AppError) {
      res.type("html").send(
        renderSendTestFormPage({
          admin: req.adminUser!,
          error: error.message,
          values: formValues,
        }),
      );
      return;
    }
    next(error);
  }
}

export async function getCreditForm(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const client = await getOrCreateTestClient();
    const countryCode = String(req.query.country_code ?? "CL").trim() || "CL";
    const balance = await getBalanceByClientId(client.id, countryCode);
    const error =
      typeof req.query.error === "string" ? req.query.error : undefined;
    let successMessage: string | null = null;
    if (typeof req.query.credited === "string" && req.query.credited) {
      const units = req.query.credited;
      const country =
        typeof req.query.country === "string" ? req.query.country : "CL";
      const available =
        typeof req.query.available === "string" ? req.query.available : "";
      successMessage = `Crédito aplicado: +${units} unidades (${country}). Disponible: ${available || String(balance?.available_units ?? "—")}.`;
    }

    res.type("html").send(
      renderCreditFormPage({
        admin: req.adminUser!,
        clientName: client.company_name,
        currentBalance: balance,
        error,
        successMessage,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postCredit(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const client = await getOrCreateTestClient();
    const countryCode = String(req.body?.country_code ?? "CL").trim() || "CL";
    const units = Number.parseInt(String(req.body?.units ?? "0"), 10);
    const description =
      String(req.body?.description ?? "").trim() || "Crédito manual de prueba";

    if (!Number.isInteger(units) || units <= 0) {
      res.type("html").send(
        renderCreditFormPage({
          admin: req.adminUser!,
          clientName: client.company_name,
          currentBalance: await getBalanceByClientId(client.id, countryCode),
          error: "Las unidades deben ser un número entero mayor a 0.",
        }),
      );
      return;
    }

    const updated = await creditManualBalance({
      clientId: client.id,
      countryCode,
      units,
      description,
    });

    res.redirect(
      `/admin/clients/test/credit?credited=${units}&country=${encodeURIComponent(countryCode)}&available=${updated.available_units}`,
    );
  } catch (error) {
    if (error instanceof Error) {
      try {
        const client = await getOrCreateTestClient();
        res.type("html").send(
          renderCreditFormPage({
            admin: req.adminUser!,
            clientName: client.company_name,
            currentBalance: null,
            error: error.message,
          }),
        );
        return;
      } catch {
        /* fall through */
      }
    }
    next(error);
  }
}

export async function getAsmscDiagnosticsPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    let balanceResult = null;
    let balanceError: string | null = null;

    try {
      balanceResult = await fetchAsmscBalance();
      const record = balanceResult as Record<string, unknown>;
      const remarks = String(record.remarks ?? record.message ?? "");
      const status = String(record.status ?? "").toUpperCase();
      if (status === "F" && remarks) {
        balanceError = remarks;
      }
    } catch (error) {
      balanceError =
        error instanceof AppError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Error al consultar CheckBalance";
    }

    const publicIp = await fetchPublicIp();

    res.type("html").send(
      renderAsmscDiagnosticsPage({
        admin: req.adminUser!,
        balanceResult,
        balanceError,
        publicIp,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postSimulateDlr(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (isProduction()) {
    res.status(404).send("No disponible en producción");
    return;
  }

  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    await simulateDeliveredDlrForMessage(id);
    res.redirect(`/admin/messages/${id}?simulated=delivered`);
  } catch (error) {
    next(error);
  }
}

export async function postSimulateDlrFailed(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (isProduction()) {
    res.status(404).send("No disponible en producción");
    return;
  }

  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    await simulateFailedDlrForMessage(id);
    res.redirect(`/admin/messages/${id}?simulated=failed`);
  } catch (error) {
    next(error);
  }
}

export async function getTestClientLedger(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const client = await getOrCreateTestClient();
    const entries = await listBalanceLedgerForClient(client.id);

    res.type("html").send(
      renderLedgerPage({
        admin: req.adminUser!,
        clientName: client.company_name,
        entries,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getTelegramDiagnosticsPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await fetchTelegramBotInfoForDiagnostics();
    const client = await getOrCreateTestClient();
    const users = await listTelegramUsersByClientId(client.id);
    const runtime = getTelegramRuntimeStatus();
    const knowledgeTableOk = await checkKnowledgeTableAvailable();
    let knowledgeActiveCount = 0;
    let knowledgeRecent: Awaited<ReturnType<typeof listKnowledgeArticles>> = [];
    if (knowledgeTableOk) {
      knowledgeActiveCount = await countActiveKnowledgeArticles();
      knowledgeRecent = await listKnowledgeArticles({
        activeOnly: true,
        limit: 5,
      });
    }

    res.type("html").send(
      renderTelegramDiagnosticsPage({
        admin: req.adminUser!,
        clientName: client.company_name,
        telegramUsers: users,
        getMeOk: Boolean(runtime.botInfo),
        knowledgeTableOk,
        knowledgeActiveCount,
        knowledgeRecent,
        testResult:
          typeof req.query.test_result === "string"
            ? req.query.test_result
            : undefined,
        testError:
          typeof req.query.test_error === "string"
            ? req.query.test_error
            : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postTelegramDiagnosticsTest(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  try {
    const chatRaw = String(req.body?.chat_id ?? "").trim();
    if (!/^\d+$/.test(chatRaw)) {
      res.redirect(
        `/admin/telegram/diagnostics?test_error=${encodeURIComponent("chat_id debe ser solo dígitos.")}`,
      );
      return;
    }

    const result = await sendTelegramTestToChatId(
      chatRaw,
      TELEGRAM_CONNECTION_TEST_MESSAGE,
    );

    res.redirect(
      `/admin/telegram/diagnostics?test_result=${encodeURIComponent(
        `Mensaje enviado correctamente (message_id ${result.message_id}).`,
      )}`,
    );
  } catch (error) {
    const msg =
      error instanceof AppError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Error al enviar mensaje de prueba";
    res.redirect(
      `/admin/telegram/diagnostics?test_error=${encodeURIComponent(msg)}`,
    );
  }
}

export async function getAsmscBalancePage(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  try {
    const provider = await fetchAsmscBalance();
    res.type("html").send(
      renderAsmscBalancePage({
        admin: req.adminUser!,
        provider,
      }),
    );
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Error al consultar balance aSMSC";

    res.type("html").send(
      renderAsmscBalancePage({
        admin: req.adminUser!,
        provider: {},
        error: message,
      }),
    );
  }
}

export async function getTelegramIntentTest(
  req: Request,
  res: Response,
): Promise<void> {
  res.type("html").send(
    renderTelegramIntentTestPage({
      admin: req.adminUser!,
      builtInTests: TELEGRAM_INTENT_TEST_CASES,
    }),
  );
}

export async function postTelegramIntentTest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const phrase = String((req.body as Record<string, unknown>).phrase ?? "").trim();
    if (!phrase) {
      throw new ValidationError("Escribe una frase para probar.");
    }
    const simulation = await simulateTelegramIntent(phrase, null);
    res.type("html").send(
      renderTelegramIntentTestPage({
        admin: req.adminUser!,
        phrase,
        simulation,
        builtInTests: TELEGRAM_INTENT_TEST_CASES,
      }),
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      res.type("html").send(
        renderTelegramIntentTestPage({
          admin: req.adminUser!,
          error: error.message,
          builtInTests: TELEGRAM_INTENT_TEST_CASES,
        }),
      );
      return;
    }
    next(error);
  }
}
