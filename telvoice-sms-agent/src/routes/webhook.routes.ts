import { Router } from "express";
import {
  asmscDlrHandler,
  smsDlrHandler,
} from "../controllers/webhook.controller.js";
import { inboundSmsWebhookHandler, numeracionesInboundWebhookHandler } from "../controllers/inbound-sms-webhook.controller.js";
import {
  telsimSmsReceivedHandler,
  telsimWebhookInfoHandler,
} from "../controllers/telsim-webhook.controller.js";

export const webhookRouter = Router();

webhookRouter.post("/asmsc/dlr", asmscDlrHandler);
webhookRouter.post("/sms/dlr", smsDlrHandler);
webhookRouter.get("/telsim/sms", telsimWebhookInfoHandler);
webhookRouter.post("/telsim/sms", telsimSmsReceivedHandler);
webhookRouter.post("/inbound-sms", inboundSmsWebhookHandler);
webhookRouter.post("/numeraciones/inbound", numeracionesInboundWebhookHandler);
