import { Router } from "express";
import { asmscDlrHandler } from "../controllers/webhook.controller.js";

export const webhookRouter = Router();

webhookRouter.post("/asmsc/dlr", asmscDlrHandler);
