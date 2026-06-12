import { Router } from "express";
import {
  getApiAgentPlanStatus,
  getApiNumeracionById,
  getApiNumeracionSms,
  getApiNumeraciones,
  getApiSmsInboxMessages,
  patchApiNumeracionConfig,
  postApiAgentPlanRequest,
  postApiNumeracionWebhookTest,
} from "../controllers/app-numeraciones-api.controller.js";
import { loadClientSession } from "../middleware/admin-auth.js";
import { requireClientPanelApi } from "../middleware/client-panel-api-auth.js";
import { requireClientPanelAgentLineApi } from "../middleware/client-panel-agent-line.js";

export const appNumeracionesApiRouter = Router();

appNumeracionesApiRouter.use(loadClientSession);
appNumeracionesApiRouter.use(requireClientPanelApi);

appNumeracionesApiRouter.get("/numeraciones", getApiNumeraciones);
appNumeracionesApiRouter.get("/sms-inbox/messages", getApiSmsInboxMessages);
appNumeracionesApiRouter.get("/numeraciones/:id", getApiNumeracionById);
appNumeracionesApiRouter.get("/numeraciones/:id/sms", getApiNumeracionSms);
appNumeracionesApiRouter.patch("/numeraciones/:id/config", patchApiNumeracionConfig);
appNumeracionesApiRouter.post(
  "/numeraciones/:id/webhook/test",
  postApiNumeracionWebhookTest,
);
appNumeracionesApiRouter.post(
  "/agent-plan/request",
  requireClientPanelAgentLineApi,
  postApiAgentPlanRequest,
);
appNumeracionesApiRouter.get(
  "/agent-plan/status",
  requireClientPanelAgentLineApi,
  getApiAgentPlanStatus,
);
