import type { NextFunction, Request, Response } from "express";
import {
  createSmsPricingTier,
  deactivateSmsPricingTier,
  getAllSmsPricingTiers,
  updateSmsPricingTier,
} from "../services/pricing/smsPricingService.js";
import type { SmsPricingTierRow } from "../types/commercial.js";
import { ValidationError } from "../utils/errors.js";
import { validateUuidParam } from "../utils/validation.js";

function auditContext(req: Request) {
  return {
    actorUserId: req.adminUser?.id,
    actorRole: req.adminUser?.role,
    ipAddress: req.ip || undefined,
  };
}

function tierJson(tier: SmsPricingTierRow) {
  return {
    id: tier.id,
    label: tier.label,
    min_sms: tier.min_quantity,
    unit_price_clp: Number(tier.unit_price),
    currency: tier.currency,
    tax_label: "+ IVA",
    active: tier.is_active,
    sort_order: tier.sort_order,
    created_at: tier.created_at,
    updated_at: tier.updated_at,
  };
}

export async function getAdminSmsPricingTiers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const countryCode =
      typeof req.query.country_code === "string"
        ? req.query.country_code.trim().toUpperCase()
        : "CL";
    const tiers = await getAllSmsPricingTiers(countryCode);
    res.json({ success: true, tiers: tiers.map(tierJson) });
  } catch (error) {
    next(error);
  }
}

export async function postAdminSmsPricingTier(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const tier = await createSmsPricingTier(
      {
        country_code:
          typeof body.country_code === "string" ? body.country_code : "CL",
        min_sms: Number(body.min_sms ?? body.min_quantity),
        unit_price: Number(body.unit_price ?? body.unit_price_clp),
        currency: typeof body.currency === "string" ? body.currency : "CLP",
        label: String(body.label ?? ""),
        is_active: body.is_active !== false && body.active !== false,
        sort_order:
          body.sort_order !== undefined ? Number(body.sort_order) : undefined,
      },
      auditContext(req),
    );
    res.status(201).json({ success: true, tier: tierJson(tier) });
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    next(error);
  }
}

export async function patchAdminSmsPricingTier(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const body = req.body as Record<string, unknown>;
    const patch: Parameters<typeof updateSmsPricingTier>[1] = {};

    if (body.label !== undefined) patch.label = String(body.label);
    if (body.min_sms !== undefined || body.min_quantity !== undefined) {
      patch.min_sms = Number(body.min_sms ?? body.min_quantity);
    }
    if (body.unit_price !== undefined || body.unit_price_clp !== undefined) {
      patch.unit_price = Number(body.unit_price ?? body.unit_price_clp);
    }
    if (body.is_active !== undefined || body.active !== undefined) {
      patch.is_active = body.is_active === true || body.active === true;
    }
    if (body.sort_order !== undefined) {
      patch.sort_order = Number(body.sort_order);
    }

    const tier = await updateSmsPricingTier(id, patch, auditContext(req));
    res.json({ success: true, tier: tierJson(tier) });
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    next(error);
  }
}

export async function deleteAdminSmsPricingTier(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateUuidParam(String(req.params.id ?? ""), "id");
    const tier = await deactivateSmsPricingTier(id, auditContext(req));
    res.json({ success: true, tier: tierJson(tier) });
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    next(error);
  }
}
