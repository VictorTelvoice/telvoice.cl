import type { NextFunction, Request, Response } from "express";
import { getBootstrapStatus } from "../config/bootstrap-status.js";
import { env } from "../config/env.js";
import { getBalanceByClientId } from "../services/balanceService.js";
import { getTestClientBundle } from "../services/clientService.js";
import { renderContactsPage } from "../views/admin-ui/sections/contacts-page.js";
import { renderChatPage } from "../views/admin-ui/sections/chat-page.js";
import { renderInvoicesPage } from "../views/admin-ui/sections/invoices-page.js";
import { renderReportsPage } from "../views/admin-ui/sections/reports-page.js";
import { renderTemplatesPage } from "../views/admin-ui/sections/templates-page.js";

async function loadSmsBalance(): Promise<string | undefined> {
  const bootstrap = getBootstrapStatus();
  if (!env.supabase.url || !env.supabase.serviceRoleKey || bootstrap.pgrestSchemaCacheIssue) {
    return undefined;
  }
  try {
    const testClient = await getTestClientBundle();
    const balance = await getBalanceByClientId(testClient.client.id);
    return balance ? String(balance.available_units) : undefined;
  } catch {
    return undefined;
  }
}

export async function getReportsPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const smsBalance = await loadSmsBalance();
    res.type("html").send(
      renderReportsPage({ admin: req.adminUser!, smsBalance }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getContactsPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const smsBalance = await loadSmsBalance();
    res.type("html").send(
      renderContactsPage({ admin: req.adminUser!, smsBalance }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getInvoicesPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const smsBalance = await loadSmsBalance();
    res.type("html").send(
      renderInvoicesPage({ admin: req.adminUser!, smsBalance }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getTemplatesPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const smsBalance = await loadSmsBalance();
    res.type("html").send(
      renderTemplatesPage({ admin: req.adminUser!, smsBalance }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getChatPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const smsBalance = await loadSmsBalance();
    res.type("html").send(
      renderChatPage({ admin: req.adminUser!, smsBalance }),
    );
  } catch (error) {
    next(error);
  }
}

/** Alias amigable sin romper /admin/sms/send-test */
export function redirectSendSmsAlias(_req: Request, res: Response): void {
  res.redirect(301, "/admin/sms/send-test");
}
