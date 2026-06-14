import type { NextFunction, Request, Response } from "express";
import { canOperateClientPanel } from "../types/roles.js";
import {
  createAgentPlanRequest,
  getAgentDashboardData,
  getAgentPlanStatusPayload,
} from "../services/clientAgentPlanService.js";
import {
  getClientNumberById,
  getClientNumbersModuleState,
  filterClientPanelNumbers,
  listClientNumbersByCompany,
} from "../services/clientNumberService.js";
import {
  countUnreadInboundByClientNumber,
  getInboundSmsById,
  listInboundSmsByCompany,
  updateInboundSmsStatus,
} from "../services/inboundSmsService.js";
import { getSupabase } from "../database/supabaseClient.js";
import type { AgentPlanCode } from "../types/client-numbers.js";
import {
  isAgentPlanIntentQuery,
  parseAgentPlanCode,
} from "../utils/agent-plan-intent.js";
import type { NumberIntegrationType } from "../types/client-numbers.js";
import { AppError } from "../utils/errors.js";
import { isMissingTableError } from "../utils/db-table.js";
import { validateUuidParam } from "../utils/validation.js";
import { buildAppContext } from "./app.controller.js";
import type { AppPageContext } from "../views/app-ui/app-page-wrap.js";
import { renderNoCompanyPage } from "../views/app-ui/app-page-wrap.js";
import { renderAppNumeracionesPage } from "../views/app-ui/app-numeraciones-page.js";
import {
  parseSmsInboxFilters,
  renderAppSmsInboxPage,
} from "../views/app-ui/app-sms-inbox-page.js";
import { renderAppAgentePage } from "../views/app-ui/app-agente-page.js";
import { renderAppAgentPlansPage } from "../views/app-ui/app-agent-plans-page.js";
import { renderAppNumberIntegrationsPage } from "../views/app-ui/app-number-integrations-page.js";

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

export async function getAppNumeraciones(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const [module, allNumbers] = await Promise.all([
      getClientNumbersModuleState(),
      listClientNumbersByCompany(ctx.company.id),
    ]);
    const numbers = filterClientPanelNumbers(allNumbers);
    return renderAppNumeracionesPage(ctx, { module, numbers });
  });
}

export async function getAppSmsInbox(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    let filters = parseSmsInboxFilters(
      req.query as Record<string, string | string[] | undefined>,
    );
    const allNumbers = await listClientNumbersByCompany(ctx.company.id);
    const numbers = filterClientPanelNumbers(allNumbers);
    if (
      filters.numberId &&
      !numbers.some((n) => n.id === filters.numberId)
    ) {
      filters = { ...filters, numberId: undefined };
    }
    const activeNumbers = numbers.filter((n) => n.status === "active");
    if (!filters.numberId && activeNumbers.length > 0) {
      filters = { ...filters, numberId: activeNumbers[0]!.id };
    }
    const messages = await listInboundSmsByCompany(ctx.company.id, {
      numberId: filters.numberId,
      q: filters.q,
      from: filters.from,
      startDate: filters.startDate,
      endDate: filters.endDate,
      status: filters.status || undefined,
    });

    let selectedMessage = null;
    if (filters.selectedId) {
      selectedMessage = await getInboundSmsById(ctx.company.id, filters.selectedId);
    } else if (messages.length) {
      selectedMessage = messages[0] ?? null;
    }

    const unreadByNumber = await countUnreadInboundByClientNumber(ctx.company.id);

    return renderAppSmsInboxPage(ctx, {
      numbers,
      messages,
      filters,
      selectedMessage,
      unreadByNumber,
    });
  });
}

export async function getAppSmsInboxExportCsv(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const ctx = await buildAppContext(req);
    if (!ctx) {
      res.status(403).send("Sin acceso.");
      return;
    }
    const filters = parseSmsInboxFilters(
      req.query as Record<string, string | string[] | undefined>,
    );
    const messages = await listInboundSmsByCompany(ctx.company.id, {
      numberId: filters.numberId,
      q: filters.q,
      from: filters.from,
      startDate: filters.startDate,
      endDate: filters.endDate,
      status: filters.status || undefined,
    });

    const header = "id,to_number,from_number,body,detected_otp,received_at,status,source\n";
    const rows = messages
      .map((m) => {
        const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
        return [
          m.id,
          esc(m.to_number),
          esc(m.from_number ?? ""),
          esc(m.body),
          esc(m.detected_otp ?? ""),
          m.received_at,
          m.status,
          esc(m.source ?? ""),
        ].join(",");
      })
      .join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="sms-entrantes.csv"',
    );
    res.send(header + rows);
  } catch (error) {
    next(error);
  }
}

export async function postAppSmsInboxMarkRead(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const ctx = await buildAppContext(req);
    if (!ctx || !canOperateClientPanel(ctx.profile.role)) {
      res.redirect("/app/sms-inbox?error=Sin+permiso");
      return;
    }
    const messageId = validateUuidParam(String(req.params.id ?? ""), "mensaje");
    await updateInboundSmsStatus(ctx.company.id, messageId, "read");
    const redirect =
      typeof req.body?.redirect === "string" && req.body.redirect.startsWith("/app/")
        ? req.body.redirect
        : "/app/sms-inbox";
    res.redirect(redirect);
  } catch (error) {
    next(error);
  }
}

export async function getAppAgente(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const [agent, numbers] = await Promise.all([
      getAgentDashboardData(ctx.company.id),
      listClientNumbersByCompany(ctx.company.id),
    ]);
    return renderAppAgentePage(ctx, { agent, numbers });
  });
}

export async function getAppAgentPlans(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await withAppContext(req, res, next, async (ctx) => {
    const query = req.query as Record<string, string | string[] | undefined>;
    const selectedPlan = parseAgentPlanCode(query.plan);
    const statusPayload = await getAgentPlanStatusPayload(ctx.company.id);
    const showRequestSuccess = query.requested === "1";
    const highlightRequest = selectedPlan
      ? statusPayload.pendingRequests.find((r) => r.plan_code === selectedPlan) ??
        statusPayload.requests.find((r) => r.plan_code === selectedPlan) ??
        null
      : statusPayload.pendingRequests[0] ?? null;

    return renderAppAgentPlansPage(ctx, {
      pendingRequests: statusPayload.pendingRequests.filter((r) =>
        ["pending", "reviewing", "approved"].includes(r.status),
      ),
      activeSubscription: statusPayload.subscription,
      selectedPlan,
      showIntentBanner: isAgentPlanIntentQuery(query),
      showRequestSuccess,
      highlightRequest,
    });
  });
}

export async function postAppAgentPlanRequest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const ctx = await buildAppContext(req);
    if (!ctx || !canOperateClientPanel(ctx.profile.role)) {
      res.redirect("/app/planes-agente?error=Sin+permiso+para+solicitar+plan");
      return;
    }

    const planCode = String(req.body?.plan_code ?? "").trim() as AgentPlanCode;
    if (!["start", "pro", "business"].includes(planCode)) {
      res.redirect("/app/planes-agente?error=Plan+no+válido");
      return;
    }

    const preferredRaw = String(req.body?.preferred_number_type ?? "either").trim();
    const preferredNumberType =
      preferredRaw === "sim_real" || preferredRaw === "fixed_line"
        ? preferredRaw
        : "either";

    await createAgentPlanRequest(ctx.company.id, planCode, preferredNumberType);
    res.redirect(
      `/app/planes-agente?requested=1&plan=${encodeURIComponent(planCode)}&intent=agent_plan&ok=Solicitud+recibida`,
    );
  } catch (error) {
    if (error instanceof AppError) {
      res.redirect(
        `/app/planes-agente?error=${encodeURIComponent(error.message)}`,
      );
      return;
    }
    next(error);
  }
}

export async function getAppNumberIntegrations(
  req: Request,
  res: Response,
  next: NextFunction,
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

    const numberId = validateUuidParam(String(req.params.id ?? ""), "numeración");
    const number = await getClientNumberById(ctx.company.id, numberId);
    if (!number) {
      res.redirect("/app/numeraciones?error=Numeración+no+encontrada");
      return;
    }

    const sb = getSupabase();
    const { data: integrations, error } = await sb
      .from("number_integrations")
      .select("*")
      .eq("company_id", ctx.company.id)
      .eq("client_number_id", numberId);

    if (error && !isMissingTableError(error)) {
      throw error;
    }

    res.type("html").send(
      renderAppNumberIntegrationsPage(ctx, {
        number,
        integrations: (integrations ?? []).map((row) => ({
          id: String(row.id),
          company_id: String(row.company_id),
          client_number_id:
            row.client_number_id != null ? String(row.client_number_id) : null,
          type: row.type as NumberIntegrationType,
          name: row.name != null ? String(row.name) : null,
          status: row.status as "active" | "inactive" | "error",
          config:
            row.config && typeof row.config === "object"
              ? (row.config as Record<string, unknown>)
              : {},
          last_success_at:
            row.last_success_at != null ? String(row.last_success_at) : null,
          last_error_at:
            row.last_error_at != null ? String(row.last_error_at) : null,
          last_error: row.last_error != null ? String(row.last_error) : null,
          created_at: String(row.created_at),
          updated_at: String(row.updated_at),
        })),
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postAppNumberIntegrations(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const ctx = await buildAppContext(req);
    if (!ctx || !canOperateClientPanel(ctx.profile.role)) {
      res.redirect("/app/numeraciones?error=Sin+permiso");
      return;
    }

    const numberId = validateUuidParam(String(req.params.id ?? ""), "numeración");
    const number = await getClientNumberById(ctx.company.id, numberId);
    if (!number) {
      res.redirect("/app/numeraciones?error=Numeración+no+encontrada");
      return;
    }

    const integrationType = String(req.body?.integration_type ?? "").trim();
    const sb = getSupabase();

    async function saveIntegration(
      type: NumberIntegrationType,
      name: string,
      config: Record<string, unknown>,
    ): Promise<void> {
      const { data: existing } = await sb
        .from("number_integrations")
        .select("id")
        .eq("company_id", ctx!.company.id)
        .eq("client_number_id", numberId)
        .eq("type", type)
        .maybeSingle();

      if (existing?.id) {
        const { error: updErr } = await sb
          .from("number_integrations")
          .update({ name, status: "active", config })
          .eq("id", existing.id);
        if (updErr) throw updErr;
        return;
      }

      const { error: insErr } = await sb.from("number_integrations").insert({
        company_id: ctx!.company.id,
        client_number_id: numberId,
        type,
        name,
        status: "active",
        config,
      });
      if (insErr) throw insErr;
    }

    if (integrationType === "webhook") {
      const url = String(req.body?.webhook_url ?? "").trim();
      if (!url) {
        res.redirect(
          `/app/numeraciones/${numberId}/integraciones?error=URL+requerida`,
        );
        return;
      }
      const config: Record<string, unknown> = { url };
      const secret = String(req.body?.webhook_secret ?? "").trim();
      if (secret) config.secret = secret;
      await saveIntegration("webhook", "Webhook SMS", config);
    } else if (integrationType === "telegram") {
      const chatId = String(req.body?.telegram_chat_id ?? "").trim();
      if (!chatId) {
        res.redirect(
          `/app/numeraciones/${numberId}/integraciones?error=Chat+ID+requerido`,
        );
        return;
      }
      await saveIntegration("telegram", "Telegram", { chat_id: chatId });
    }

    res.redirect(
      `/app/numeraciones/${numberId}/integraciones?ok=Configuración+guardada`,
    );
  } catch (error) {
    if (isMissingTableError(error)) {
      res.redirect("/app/numeraciones?error=Módulo+no+disponible");
      return;
    }
    next(error);
  }
}

export async function postAppNumberWebhookTest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const ctx = await buildAppContext(req);
    if (!ctx) {
      res.redirect("/app/numeraciones?error=Sin+acceso");
      return;
    }
    const numberId = validateUuidParam(String(req.params.id ?? ""), "numeración");
    res.redirect(
      `/app/numeraciones/${numberId}/integraciones?ok=Prueba+de+webhook+programada+(Fase+3)`,
    );
  } catch (error) {
    next(error);
  }
}
