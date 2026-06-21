import { Router } from "express";
import {
  getPublicPendingSimCheckout,
  getPublicProducts,
  getPublicSimAvailability,
  getPublicSimAvailableNumbers,
  getPublicSimPlans,
  getPublicSmsPricingTiersHandler,
  postPublicCheckout,
  postPublicClaim,
  postPublicContactLead,
  postPublicLead,
  postPublicQuote,
} from "../controllers/public.controller.js";

export const publicRouter = Router();

publicRouter.get("/products", getPublicProducts);
publicRouter.get("/sim-availability", getPublicSimAvailability);
/** Catálogo comercial SIM de solo lectura (landing pública). */
publicRouter.get("/sim-plans", getPublicSimPlans);
publicRouter.get("/sim-available-numbers", getPublicSimAvailableNumbers);
publicRouter.get("/pending-sim-checkout", getPublicPendingSimCheckout);
publicRouter.get("/sms-pricing-tiers", getPublicSmsPricingTiersHandler);
publicRouter.post("/quote", postPublicQuote);
publicRouter.post("/contact-lead", postPublicContactLead);
publicRouter.post("/lead", postPublicLead);
publicRouter.post("/checkout", postPublicCheckout);
publicRouter.post("/claim", postPublicClaim);
