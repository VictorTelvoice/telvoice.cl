import { Router } from "express";
import {
  getPublicProducts,
  postPublicLead,
  postPublicQuote,
} from "../controllers/public.controller.js";

export const publicRouter = Router();

publicRouter.get("/products", getPublicProducts);
publicRouter.post("/quote", postPublicQuote);
publicRouter.post("/lead", postPublicLead);
