import type { NextFunction, Request, Response } from "express";
import { listCompanies } from "../services/companyService.js";
import { listAdminInboundSms } from "../services/adminInboundSmsService.js";
import {
  parseAdminSmsInboxFilters,
  renderAdminSmsInboxPage,
} from "../views/admin-ui/sections/admin-sms-inbox-pages.js";

function pageOpts(req: Request) {
  return {
    admin: req.adminUser!,
    flash: typeof req.query.ok === "string" ? req.query.ok : undefined,
    error: typeof req.query.error === "string" ? req.query.error : undefined,
  };
}

export async function getAdminSmsInboxPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const filters = parseAdminSmsInboxFilters(
      req.query as Record<string, string | string[] | undefined>,
    );
    const [messages, companies] = await Promise.all([
      listAdminInboundSms(filters),
      listCompanies(200),
    ]);

    const msgId = typeof req.query.msg === "string" ? req.query.msg.trim() : "";
    const selectedMessage = msgId
      ? messages.find((m) => m.id === msgId) ?? null
      : null;

    res.type("html").send(
      renderAdminSmsInboxPage(pageOpts(req), {
        filters,
        messages,
        companies,
        selectedMessage,
      }),
    );
  } catch (error) {
    next(error);
  }
}
