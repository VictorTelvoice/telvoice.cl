import { Router } from "express";
import {
  getPublicPendingSimCheckout,
  getPublicProducts,
  getPublicSimAvailability,
  getPublicSimAvailableNumbers,
  getPublicSimPlans,
  postPublicCheckout,
  postPublicClaim,
  postPublicLead,
  postPublicQuote,
} from "../controllers/public.controller.js";

export const publicRouter = Router();

publicRouter.get("/products", getPublicProducts);
publicRouter.get("/sim-availability", getPublicSimAvailability);
publicRouter.get("/sim-plans", getPublicSimPlans);
publicRouter.get("/sim-available-numbers", getPublicSimAvailableNumbers);
publicRouter.get("/pending-sim-checkout", getPublicPendingSimCheckout);
publicRouter.post("/quote", postPublicQuote);
publicRouter.post("/lead", postPublicLead);
publicRouter.post("/checkout", postPublicCheckout);
publicRouter.post("/claim", postPublicClaim);
