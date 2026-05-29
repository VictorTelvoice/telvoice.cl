import { Router } from "express";
import { getPublicApiBalance } from "../controllers/public-api-balance.controller.js";
import {
  getPublicApiMessageById,
  listPublicApiMessages,
} from "../controllers/public-api-messages.controller.js";
import { postPublicApiSmsSend } from "../controllers/public-api-sms-send.controller.js";
import { requireApiKeyScope } from "../middleware/api-key-auth.js";
import { publicApiRequestContext } from "../middleware/public-api-request-context.js";

export const v1Router = Router();

v1Router.use(publicApiRequestContext);

v1Router.get("/balance", requireApiKeyScope("balance:read"), getPublicApiBalance);
v1Router.get(
  "/messages",
  requireApiKeyScope("messages:read"),
  listPublicApiMessages,
);
v1Router.get(
  "/messages/:id",
  requireApiKeyScope("messages:read"),
  getPublicApiMessageById,
);
v1Router.post("/sms/send", requireApiKeyScope("sms:send"), postPublicApiSmsSend);
