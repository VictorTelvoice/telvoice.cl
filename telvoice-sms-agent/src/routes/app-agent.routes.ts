import { Router } from "express";
import {
  getAppAgentHistory,
  postAppAgentChat,
  postAppAgentFeedback,
  postAppAgentUploadCsv,
} from "../controllers/app-agent.controller.js";
import { loadClientSession } from "../middleware/admin-auth.js";
import { requireClientPanelApi } from "../middleware/client-panel-api-auth.js";

export const appAgentRouter = Router();

appAgentRouter.use(loadClientSession);
appAgentRouter.use(requireClientPanelApi);

appAgentRouter.post("/chat", postAppAgentChat);
appAgentRouter.post("/feedback", postAppAgentFeedback);
appAgentRouter.post("/upload-csv", postAppAgentUploadCsv);
appAgentRouter.get("/history", getAppAgentHistory);
