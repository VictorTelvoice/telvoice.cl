import type { NextFunction, Request, Response } from "express";
import {
  getSimPlanById,
  getSimPlanSettings,
  updateSimPlanSettings,
} from "../services/simPlanSettingsService.js";
import { AppError } from "../utils/errors.js";
import { normalizeSimPlanFeatures } from "../utils/simPlans.js";
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
    const annual_discount_percentRaw = Number(req.body?.annual_discount_percent);
    const included_smsRaw = Number(req.body?.included_sms);
    const includes_outbound_sms = parseCheckbox(req.body?.includes_outbound_sms);
    const isCustom = planId === "custom";
    const annual_enabled = isCustom ? false : parseCheckbox(req.body?.annual_enabled);

    const promo_enabled = isCustom ? false : parseCheckbox(req.body?.promo_enabled);
    const promo_discount_percent = Number(req.body?.promo_discount_percent);
    const promo_duration_months = Number(req.body?.promo_duration_months);
    const resolvedIncludedSms = includes_outbound_sms
      ? Number.isFinite(included_smsRaw)
        ? included_smsRaw
        : existing.included_sms
      : 0;
    const normalizedFeatures = normalizeSimPlanFeatures(
      parseFeatureList(req.body?.feature_list),
      isCustom ? false : includes_outbound_sms,
      isCustom ? 0 : resolvedIncludedSms,
    );

    await updateSimPlanSettings(
      {
        plan_id: planId,
        monthly_price_clp,
        annual_discount_percent: isCustom
          ? 0
          : Number.isFinite(annual_discount_percentRaw)
            ? annual_discount_percentRaw
            : existing.annual_discount_percent,
        annual_enabled,
        included_sms: resolvedIncludedSms,
        includes_outbound_sms: isCustom ? false : includes_outbound_sms,
        is_visible: parseCheckbox(req.body?.is_visible),
        is_featured: parseCheckbox(req.body?.is_featured),
        badge: String(req.body?.badge ?? ""),
        ribbon: String(req.body?.ribbon ?? ""),
        short_description: String(req.body?.short_description ?? ""),
        feature_list: normalizedFeatures,
        promo_enabled,
        promo_discount_percent: promo_enabled ? promo_discount_percent : 0,
        promo_duration_months: promo_enabled ? promo_duration_months : 0,
        promo_label: String(req.body?.promo_label ?? ""),
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
