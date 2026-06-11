import type { NextFunction, Request, Response } from "express";
import { getBootstrapStatus } from "../config/bootstrap-status.js";
import { env } from "../config/env.js";
import { getBalanceByClientId } from "../services/balanceService.js";
import { getTestClientBundle } from "../services/clientService.js";
import { listAllCampaignsWithCompany } from "../services/smsCampaignService.js";
import { getCampaignTrafficReadiness } from "../services/campaignReadinessService.js";
import { listAllPanelMessagesWithCompany } from "../services/panelSmsMessageService.js";
import { getSmsProviderStatusView } from "../services/smsProviderStatusService.js";
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

export async function getSaCampaignsPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const smsBalance = await loadGlobalSmsHint();
    const campaigns = await listAllCampaignsWithCompany(150);
    const companyIds = [
      ...new Set(campaigns.map((c) => c.company_id).filter(Boolean)),
    ].slice(0, 40);
    const trafficByCompany = new Map<
      string,
      Awaited<ReturnType<typeof getCampaignTrafficReadiness>>
    >();
    await Promise.all(
      companyIds.map(async (companyId) => {
        trafficByCompany.set(
          companyId,
          await getCampaignTrafficReadiness(companyId),
        );
      }),
    );
    res
      .type("html")
      .send(
        renderSaCampaignsPage({
          admin: req.adminUser!,
          smsBalance,
          campaigns,
          trafficByCompany,
        }),
      );
  } catch (error) {
    next(error);
  }
}

export async function getSaMessagesPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const smsBalance = await loadGlobalSmsHint();
    const search =
      typeof req.query.q === "string" ? req.query.q.trim() : "";
    const companyId =
      typeof req.query.company_id === "string"
        ? req.query.company_id.trim()
        : "";
    const messages = await listAllPanelMessagesWithCompany({
      limit: 150,
      companyId: companyId || undefined,
      search: search || undefined,
    });
    res
      .type("html")
      .send(
        renderSaMessagesPage({
          admin: req.adminUser!,
          smsBalance,
          messages,
          search,
          companyId,
        }),
      );
  } catch (error) {
    next(error);
  }
}
export const getSaDlrPage = saPage(renderSaDlrPage);
export async function getSaProvidersPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const smsBalance = await loadGlobalSmsHint();
    const providerStatus = await getSmsProviderStatusView();
    res
      .type("html")
      .send(
        renderSaProvidersPage({
          admin: req.adminUser!,
          smsBalance,
          providerStatus,
        }),
      );
  } catch (error) {
    next(error);
  }
}
export const getSaRoutesPage = saPage(renderSaRoutesPage);
export const getSaApiKeysPage = saPage(renderSaApiKeysPage);

export function redirectSaBot(
  _req: Request,
  res: Response,
): void {
  res.redirect(302, "/admin/telegram/diagnostics");
}
