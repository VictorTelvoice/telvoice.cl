import type { NextFunction, Request, Response } from "express";
import { getBootstrapStatus } from "../config/bootstrap-status.js";
import { env } from "../config/env.js";
import { getBalanceByClientId } from "../services/balanceService.js";
import {
  fetchAdminApiKeyRowById,
  getAdminApiRequestDetail,
  getAdminApiUsageModuleState,
  getAdminApiUsageStats,
  getAdminSmsApiMessageDetail,
  listAdminApiKeys,
  listAdminApiRequests,
  listAdminSmsApiMessages,
} from "../services/adminApiUsageService.js";
import { getTestClientBundle } from "../services/clientService.js";
import {
  activateClientApiKey,
  pauseClientApiKey,
  revokeClientApiKey,
} from "../services/clientApiKeyService.js";
import { listCompanies } from "../services/companyService.js";
import { AppError } from "../utils/errors.js";
import { validateUuidParam } from "../utils/validation.js";
import {
  parseAdminApiUsageFilters,
  renderAdminApiUsagePage,
} from "../views/admin-ui/sections/admin-api-usage-pages.js";

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

function redirectApiUsage(res: Response, params: { ok?: string; error?: string }, query: string): void {
  const q = new URLSearchParams(query.replace(/^\?/, ""));
  if (params.ok) q.set("ok", params.ok);
  if (params.error) q.set("error", params.error);
  const qs = q.toString();
  res.redirect(303, `/admin/api-usage${qs ? `?${qs}` : ""}`);
}

function preserveQuery(req: Request): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === "string" && key !== "ok" && key !== "error") {
      q.set(key, value);
    }
  }
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

export async function getAdminApiUsagePage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const smsBalance = await loadSmsBalance();
    const filters = parseAdminApiUsageFilters(
      req.query as Record<string, string | string[] | undefined>,
    );
    const module = await getAdminApiUsageModuleState();
    const companies = await listCompanies(300);
    const names = companyNameMap(companies);

    let stats = {
      requestsLast24h: 0,
      errorsLast24h: 0,
      activeApiKeys: 0,
      sandboxMessages: 0,
      companiesWithActivity: 0,
    };
    let requests: Awaited<ReturnType<typeof listAdminApiRequests>> = [];
    let keys: Awaited<ReturnType<typeof listAdminApiKeys>> = [];
    let messages: Awaited<ReturnType<typeof listAdminSmsApiMessages>> = [];
    let loadError: string | undefined;

    if (module.requestsAvailable || module.keysAvailable || module.messagesAvailable) {
      [stats, requests, keys, messages] = await Promise.all([
        getAdminApiUsageStats(),
        module.requestsAvailable ? listAdminApiRequests(filters, names) : Promise.resolve([]),
        module.keysAvailable ? listAdminApiKeys(filters, names) : Promise.resolve([]),
        module.messagesAvailable ? listAdminSmsApiMessages(filters, names) : Promise.resolve([]),
      ]);
    } else {
      loadError = module.migrationPending
        ? "Migraciones API pendientes."
        : "Tablas API no disponibles.";
    }

    let selectedRequest = null;
    const requestParam =
      typeof req.query.request === "string" ? req.query.request.trim() : "";
    if (requestParam && module.requestsAvailable) {
      selectedRequest = await getAdminApiRequestDetail(requestParam, names);
    }

    let selectedMessage = null;
    const messageParam =
      typeof req.query.message === "string" ? req.query.message.trim() : "";
    if (messageParam && module.messagesAvailable) {
      try {
        const messageId = validateUuidParam(messageParam, "message");
        selectedMessage = await getAdminSmsApiMessageDetail(messageId, names);
      } catch {
        selectedMessage = null;
      }
    }

    res.type("html").send(
      renderAdminApiUsagePage(pageOpts(req, smsBalance), {
        module,
        filters,
        companies,
        stats,
        requests,
        keys,
        messages,
        selectedRequest,
        selectedMessage,
        loadError,
        preserveQuery: filters,
      }),
    );
  } catch (error) {
    next(error);
  }
}

async function adminKeyAction(
  req: Request,
  res: Response,
  action: "pause" | "activate" | "revoke",
): Promise<void> {
  const rawId = req.params.id;
  const keyId = validateUuidParam(
    typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] ?? "" : "",
    "id",
  );
  const row = await fetchAdminApiKeyRowById(keyId);
  if (!row) {
    redirectApiUsage(res, { error: "API Key no encontrada." }, preserveQuery(req));
    return;
  }

  let result;
  if (action === "pause") {
    result = await pauseClientApiKey(keyId, row.company_id);
  } else if (action === "activate") {
    result = await activateClientApiKey(keyId, row.company_id);
  } else {
    // TODO(admin-audit): registrar acción admin en audit log dedicado.
    result = await revokeClientApiKey(
      keyId,
      row.company_id,
      "Revocada por administrador Telvoice",
    );
  }

  if (!result.ok) {
    redirectApiUsage(res, { error: result.error ?? "No se pudo actualizar la key." }, preserveQuery(req));
    return;
  }

  const labels = {
    pause: "API Key pausada.",
    activate: "API Key activada.",
    revoke: "API Key revocada.",
  };
  redirectApiUsage(res, { ok: labels[action] }, preserveQuery(req));
}

export async function postAdminApiUsageKeyPause(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await adminKeyAction(req, res, "pause");
  } catch (error) {
    if (error instanceof AppError) {
      redirectApiUsage(res, { error: error.message }, preserveQuery(req));
      return;
    }
    next(error);
  }
}

export async function postAdminApiUsageKeyActivate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await adminKeyAction(req, res, "activate");
  } catch (error) {
    if (error instanceof AppError) {
      redirectApiUsage(res, { error: error.message }, preserveQuery(req));
      return;
    }
    next(error);
  }
}

export async function postAdminApiUsageKeyRevoke(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await adminKeyAction(req, res, "revoke");
  } catch (error) {
    if (error instanceof AppError) {
      redirectApiUsage(res, { error: error.message }, preserveQuery(req));
      return;
    }
    next(error);
  }
}
