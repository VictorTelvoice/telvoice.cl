import type { NextFunction, Request, Response } from "express";
import { getBootstrapStatus } from "../config/bootstrap-status.js";
import { env } from "../config/env.js";
import { getBalanceByClientId } from "../services/balanceService.js";
import { getTestClientBundle } from "../services/clientService.js";
import {
  renderSaApiKeysPage,
  renderSaCampaignsPage,
  renderSaClientsPage,
  renderSaDlrPage,
  renderSaMessagesPage,
  renderSaProvidersPage,
  renderSaRoutesPage,
} from "../views/admin-ui/sections/superadmin-pages.js";

async function loadGlobalSmsHint(): Promise<string | undefined> {
  const bootstrap = getBootstrapStatus();
  if (!env.supabase.url || !env.supabase.serviceRoleKey || bootstrap.pgrestSchemaCacheIssue) {
    return "18.420";
  }
  try {
    const testClient = await getTestClientBundle();
    const balance = await getBalanceByClientId(testClient.client.id);
    return balance ? String(balance.available_units) : "18.420";
  } catch {
    return "18.420";
  }
}

type PageHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

function saPage(
  render: (opts: { admin: NonNullable<Request["adminUser"]>; smsBalance?: string }) => string,
): PageHandler {
  return async (req, res, next) => {
    try {
      const smsBalance = await loadGlobalSmsHint();
      res.type("html").send(render({ admin: req.adminUser!, smsBalance }));
    } catch (error) {
      next(error);
    }
  };
}

export const getSaClientsPage = saPage(renderSaClientsPage);
export const getSaCampaignsPage = saPage(renderSaCampaignsPage);
export const getSaMessagesPage = saPage(renderSaMessagesPage);
export const getSaDlrPage = saPage(renderSaDlrPage);
export const getSaProvidersPage = saPage(renderSaProvidersPage);
export const getSaRoutesPage = saPage(renderSaRoutesPage);
export const getSaApiKeysPage = saPage(renderSaApiKeysPage);

export function redirectSaBot(
  _req: Request,
  res: Response,
): void {
  res.redirect(302, "/admin/telegram/diagnostics");
}
