import { Router } from "express";
import {
  deleteAdminSmsPricingTier,
  getAdminSmsPricingTiers,
  patchAdminSmsPricingTier,
  postAdminSmsPricingTier,
} from "../controllers/admin-sms-pricing.controller.js";
import {
  loadAdminSession,
  requireSuperAdminApi,
} from "../middleware/admin-auth.js";

export const adminApiRouter = Router();

adminApiRouter.use(loadAdminSession);
adminApiRouter.use(requireSuperAdminApi);

adminApiRouter.get("/sms-pricing-tiers", getAdminSmsPricingTiers);
adminApiRouter.post("/sms-pricing-tiers", postAdminSmsPricingTier);
adminApiRouter.patch("/sms-pricing-tiers/:id", patchAdminSmsPricingTier);
adminApiRouter.delete("/sms-pricing-tiers/:id", deleteAdminSmsPricingTier);
