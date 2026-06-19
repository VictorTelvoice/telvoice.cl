import type { NextFunction, Request, Response } from "express";
import {
  getSimPlanById,
  getSimPlanSettings,
  updateSimPlanSettings,
} from "../services/simPlanSettingsService.js";
import { AppError } from "../utils/errors.js";
import {
  renderAdminSimPlanEditPage,
  renderAdminSimPlansListPage,
} from "../views/admin-ui/sections/admin-sim-plans-pages.js";

function pageOpts(req: Request) {
  return {
    admin: req.adminUser!,
    flash: typeof req.query.ok === "string" ? req.query.ok : undefined,
    error: typeof req.query.error === "string" ? req.query.error : undefined,
  };
}

function parseFeatureList(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseCheckbox(raw: unknown): boolean {
  return raw === "1" || raw === "on" || raw === true;
}

export async function getAdminSimPlansPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const plans = await getSimPlanSettings();
    res.type("html").send(renderAdminSimPlansListPage({ ...pageOpts(req), plans }));
  } catch (error) {
    next(error);
  }
}

export async function getAdminSimPlanEditPage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const planId = String(req.params.planId ?? "").trim();
    const plan = await getSimPlanById(planId);
    if (!plan) {
      res.redirect(303, "/admin/sim-plans?error=Plan+no+encontrado");
      return;
    }
    res.type("html").send(
      renderAdminSimPlanEditPage({
        admin: req.adminUser!,
        plan,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function postAdminSimPlanEdit(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const planId = String(req.params.planId ?? "").trim();
    const existing = await getSimPlanById(planId);
    if (!existing) {
      res.redirect(303, "/admin/sim-plans?error=Plan+no+encontrado");
      return;
    }

    const monthly_price_clp = Number(req.body?.monthly_price_clp);
    const annual_discount_percent = Number(req.body?.annual_discount_percent);
    const included_sms = Number(req.body?.included_sms);
    const isCustom = planId === "custom";

    await updateSimPlanSettings(
      {
        plan_id: planId,
        monthly_price_clp,
        annual_discount_percent: isCustom ? 0 : annual_discount_percent,
        annual_enabled: isCustom ? false : parseCheckbox(req.body?.annual_enabled),
        included_sms,
        is_visible: parseCheckbox(req.body?.is_visible),
        is_featured: parseCheckbox(req.body?.is_featured),
        badge: String(req.body?.badge ?? ""),
        ribbon: String(req.body?.ribbon ?? ""),
        short_description: String(req.body?.short_description ?? ""),
        feature_list: parseFeatureList(req.body?.feature_list),
      },
      req.adminUser!.id,
    );

    res.redirect(303, "/admin/sim-plans?ok=Plan+actualizado");
  } catch (error) {
    if (error instanceof AppError) {
      res.redirect(
        303,
        `/admin/sim-plans/${encodeURIComponent(String(req.params.planId ?? ""))}/edit?error=${encodeURIComponent(error.message)}`,
      );
      return;
    }
    next(error);
  }
}
