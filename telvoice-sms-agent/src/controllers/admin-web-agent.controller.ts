import type { NextFunction, Request, Response } from "express";
import {
  listWebAgentLeads,
  listWebAgentQuotes,
  listWebAgentSessions,
} from "../services/webAgentAdminService.js";
import {
  listAllPricingTiers,
  updatePricingTier,
} from "../services/smsPricingTierService.js";
import { ValidationError } from "../utils/errors.js";
import { validateUuidParam } from "../utils/validation.js";
import {
  renderPricingTiersPage,
  renderWebAgentLeadsPage,
  renderWebAgentQuotesPage,
  renderWebAgentSessionsPage,
} from "../views/admin-pages.js";

export async function getWebAgentLeads(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const leads = await listWebAgentLeads();
    res.type("html").send(
      renderWebAgentLeadsPage({ admin: req.adminUser!, leads }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getWebAgentSessions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const sessions = await listWebAgentSessions();
    res.type("html").send(
      renderWebAgentSessionsPage({ admin: req.adminUser!, sessions }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getWebAgentQuotes(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const quotes = await listWebAgentQuotes();
    res.type("html").send(
      renderWebAgentQuotesPage({ admin: req.adminUser!, quotes }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getPricingTiersAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tiers = await listAllPricingTiers("CL");
    res.type("html").send(
      renderPricingTiersPage({
        admin: req.adminUser!,
        tiers,
        successMessage:
          typeof req.query.success === "string" ? req.query.success : undefined,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postUpdatePricingTier(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const unit_price = Number(req.body.unit_price);
    const sort_order = Number(req.body.sort_order);
    if (!Number.isFinite(unit_price) || unit_price < 0) {
      throw new ValidationError("unit_price inválido.");
    }
    await updatePricingTier(id, {
      unit_price,
      label: String(req.body.label ?? "").trim(),
      is_active: req.body.is_active === "1" || req.body.is_active === "on",
      sort_order: Number.isFinite(sort_order) ? sort_order : 0,
    });
    res.redirect(
      `/admin/pricing-tiers?success=${encodeURIComponent("Tramo actualizado.")}`,
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      res.redirect(
        `/admin/pricing-tiers?error=${encodeURIComponent(error.message)}`,
      );
      return;
    }
    next(error);
  }
}
