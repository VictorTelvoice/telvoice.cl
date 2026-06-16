import type { NextFunction, Request, Response } from "express";
import { getBootstrapStatus } from "../config/bootstrap-status.js";
import { env } from "../config/env.js";
import { getBalanceByClientId } from "../services/balanceService.js";
import { getTestClientBundle } from "../services/clientService.js";
import { listCompanies } from "../services/companyService.js";
import {
  addAdminSupportTicketReply,
  addInternalSupportTicketNote,
  getSupportTicketById,
  getSupportTicketsModuleState,
  getSupportTicketStatsFromItems,
  listAllSupportTickets,
  updateSupportTicketAdmin,
} from "../services/clientSupportTicketService.js";
import type {
  AdminSupportTicketListItem,
  SupportTicketPriority,
  SupportTicketStatus,
} from "../types/support-tickets.js";
import { buildAdminAuditActorFromRequest } from "../services/supportTicketAudit.js";
import { AppError } from "../utils/errors.js";
import { resolveSupportReplyDisplayName } from "../utils/supportDisplayName.js";
import { validateUuidParam } from "../utils/validation.js";
import {
  parseAdminSupportFilters,
  renderAdminSupportPage,
} from "../views/admin-ui/sections/admin-support-pages.js";

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

function companyNameMap(
  companies: Awaited<ReturnType<typeof listCompanies>>,
): Map<string, string> {
  return new Map(companies.map((c) => [c.id, c.name]));
}

function pageOpts(req: Request, smsBalance?: string) {
  return {
    admin: req.adminUser!,
    smsBalance,
    flash: typeof req.query.ok === "string" ? req.query.ok : undefined,
    error: typeof req.query.error === "string" ? req.query.error : undefined,
  };
}

function redirectSupport(
  res: Response,
  ticketId: string | null,
  params: { ok?: string; error?: string },
): void {
  const q = new URLSearchParams();
  if (ticketId) q.set("ticket", ticketId);
  if (params.ok) q.set("ok", params.ok);
  if (params.error) q.set("error", params.error);
  const qs = q.toString();
  res.redirect(303, `/admin/support${qs ? `?${qs}` : ""}`);
}

export async function getAdminSupportPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const smsBalance = await loadSmsBalance();
    const filters = parseAdminSupportFilters(
      req.query as Record<string, string | string[] | undefined>,
    );
    const module = await getSupportTicketsModuleState();
    const companies = await listCompanies(300);
    const names = companyNameMap(companies);

    let tickets: AdminSupportTicketListItem[] = [];
    let stats = { open: 0, in_review: 0, waiting: 0, resolved: 0, urgent: 0 };
    let loadError: string | undefined;

    if (module.available) {
      const all = await listAllSupportTickets({}, names);
      if (all.ok) {
        stats = getSupportTicketStatsFromItems(all.data);
      }
      const listed = await listAllSupportTickets(filters, names);
      if (listed.ok) {
        tickets = listed.data;
      } else {
        loadError = listed.error;
      }
    } else {
      loadError = module.migrationPending
        ? "Migración de tickets pendiente."
        : "Tabla de tickets no disponible.";
    }

    let selectedTicket = null;
    const ticketParam = typeof req.query.ticket === "string" ? req.query.ticket.trim() : "";
    if (ticketParam && module.available) {
      try {
        const ticketId = validateUuidParam(ticketParam, "ticket");
        const detail = await getSupportTicketById(ticketId, names);
        if (detail.ok) {
          selectedTicket = detail.data;
        }
      } catch {
        selectedTicket = null;
      }
    }

    res.type("html").send(
      renderAdminSupportPage(pageOpts(req, smsBalance), {
        module,
        filters,
        tickets,
        stats,
        selectedTicket,
        loadError,
        preserveQuery: filters,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postAdminSupportTicketUpdate(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ticketId = validateUuidParam(String(req.params.id ?? ""), "ticket");
    const body = req.body as Record<string, string | undefined>;
    const statusRaw = body.status?.trim();
    const priorityRaw = body.priority?.trim();

    const patch: Partial<{
      status: SupportTicketStatus;
      priority: SupportTicketPriority;
    }> = {};

    const statuses: SupportTicketStatus[] = [
      "open",
      "in_review",
      "waiting",
      "resolved",
    ];
    const priorities: SupportTicketPriority[] = ["low", "medium", "high", "urgent"];

    if (statusRaw && statuses.includes(statusRaw as SupportTicketStatus)) {
      patch.status = statusRaw as SupportTicketStatus;
    }
    if (priorityRaw && priorities.includes(priorityRaw as SupportTicketPriority)) {
      patch.priority = priorityRaw as SupportTicketPriority;
    }

    const result = await updateSupportTicketAdmin(
      ticketId,
      patch,
      buildAdminAuditActorFromRequest(req),
    );
    if (!result.ok) {
      redirectSupport(res, ticketId, { error: result.error });
      return;
    }
    redirectSupport(res, ticketId, { ok: "Ticket actualizado." });
  } catch (error) {
    const msg =
      error instanceof AppError ? error.message : "No se pudo actualizar el ticket.";
    redirectSupport(res, null, { error: msg });
  }
}

export async function postAdminSupportTicketReply(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ticketId = validateUuidParam(String(req.params.id ?? ""), "ticket");
    const body = req.body as Record<string, string | undefined>;
    const message = body.message ?? "";
    const authorName = resolveSupportReplyDisplayName(req.adminUser?.name);

    const result = await addAdminSupportTicketReply(
      ticketId,
      message,
      authorName,
      buildAdminAuditActorFromRequest(req),
    );
    if (!result.ok) {
      redirectSupport(res, ticketId, { error: result.error });
      return;
    }
    redirectSupport(res, ticketId, { ok: "Respuesta enviada al cliente." });
  } catch (error) {
    const msg =
      error instanceof AppError ? error.message : "No se pudo enviar la respuesta.";
    redirectSupport(res, null, { error: msg });
  }
}

export async function postAdminSupportTicketInternalNote(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ticketId = validateUuidParam(String(req.params.id ?? ""), "ticket");
    const body = req.body as Record<string, string | undefined>;
    const message = body.message ?? "";
    const authorName = req.adminUser?.name?.trim() || "Equipo Telvoice";

    const result = await addInternalSupportTicketNote(
      ticketId,
      message,
      authorName,
      buildAdminAuditActorFromRequest(req),
    );
    if (!result.ok) {
      redirectSupport(res, ticketId, { error: result.error });
      return;
    }
    redirectSupport(res, ticketId, { ok: "Nota interna guardada." });
  } catch (error) {
    const msg =
      error instanceof AppError ? error.message : "No se pudo guardar la nota.";
    redirectSupport(res, null, { error: msg });
  }
}

export async function postAdminSupportTicketQuickAction(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ticketId = validateUuidParam(String(req.params.id ?? ""), "ticket");
    const action = String((req.body as Record<string, string>).action ?? "").trim();

    let patch: Partial<{
      status: SupportTicketStatus;
      priority: SupportTicketPriority;
    }> = {};
    let okMsg = "Acción aplicada.";

    switch (action) {
      case "in_review":
        patch = { status: "in_review" };
        okMsg = "Marcado en revisión.";
        break;
      case "waiting":
        patch = { status: "waiting" };
        okMsg = "Marcado como esperando respuesta del cliente.";
        break;
      case "resolved":
        patch = { status: "resolved" };
        okMsg = "Marcado como resuelto.";
        break;
      case "urgent":
        patch = { priority: "urgent" };
        okMsg = "Prioridad actualizada a urgente.";
        break;
      default:
        redirectSupport(res, ticketId, { error: "Acción no válida." });
        return;
    }

    const result = await updateSupportTicketAdmin(
      ticketId,
      patch,
      buildAdminAuditActorFromRequest(req),
    );
    if (!result.ok) {
      redirectSupport(res, ticketId, { error: result.error });
      return;
    }
    redirectSupport(res, ticketId, { ok: okMsg });
  } catch (error) {
    const msg = error instanceof AppError ? error.message : "No se pudo aplicar la acción.";
    redirectSupport(res, null, { error: msg });
  }
}
