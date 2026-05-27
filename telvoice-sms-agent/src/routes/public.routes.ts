import { Router } from "express";
import {
  getPublicProducts,
  postPublicCheckout,
  postPublicClaim,
  postPublicLead,
  postPublicQuote,
} from "../controllers/public.controller.js";

export const publicRouter = Router();

publicRouter.get("/products", getPublicProducts);
publicRouter.post("/quote", postPublicQuote);
publicRouter.post("/lead", postPublicLead);
publicRouter.post("/checkout", postPublicCheckout);
publicRouter.post("/claim", postPublicClaim);
