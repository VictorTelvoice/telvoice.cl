import type { NextFunction, Request, Response } from "express";
import {
  loadAgentSalesConversation,
  loadAgentSalesDashboard,
  parseAgentSalesFilters,
} from "../services/agent/agentSalesMetricsService.js";
import {
  renderAgentSalesConversationPage,
  renderAgentSalesPage,
} from "../views/admin-ui/sections/admin-agent-sales-pages.js";

function flash(req: Request): { flash?: string; error?: string } {
  const flashMsg =
    typeof req.query.ok === "string" ? req.query.ok : undefined;
  const errorMsg =
    typeof req.query.error === "string" ? req.query.error : undefined;
  return { flash: flashMsg, error: errorMsg };
}

export async function getAgentSalesPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const filters = parseAgentSalesFilters(
      req.query as Record<string, string | string[] | undefined>,
    );
    const data = await loadAgentSalesDashboard(filters);

    res.type("html").send(
      renderAgentSalesPage({
        admin: req.adminUser!,
        data,
        ...flash(req),
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getAgentSalesConversationPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const sessionId = String(req.params.sessionId ?? "").trim();
    if (!sessionId) {
      res.redirect(302, "/admin/agent-sales?error=Sesión+no+indicada");
      return;
    }

    const detail = await loadAgentSalesConversation(sessionId);

    res.type("html").send(
      renderAgentSalesConversationPage({
        admin: req.adminUser!,
        detail,
        ...flash(req),
      }),
    );
  } catch (error) {
    next(error);
  }
}
