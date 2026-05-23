import { Router } from "express";
import {
  asmscDlrHandler,
  smsDlrHandler,
} from "../controllers/webhook.controller.js";

export const webhookRouter = Router();

webhookRouter.post("/asmsc/dlr", asmscDlrHandler);
webhookRouter.post("/sms/dlr", smsDlrHandler);
