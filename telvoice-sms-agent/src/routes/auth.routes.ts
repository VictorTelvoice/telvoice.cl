import { Router } from "express";
import { postBootstrapClient } from "../controllers/auth.controller.js";

export const authRouter = Router();

authRouter.post("/bootstrap-client", postBootstrapClient);
