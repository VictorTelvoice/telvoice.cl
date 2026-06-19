import { Router } from "express";
import { balanceRouter } from "./balance.routes.js";
import { clientsRouter } from "./clients.routes.js";
import { authRouter } from "./auth.routes.js";
import { publicRouter } from "./public.routes.js";
import { smsRouter } from "./sms.routes.js";
import { telegramRouter } from "./telegram.routes.js";
import { webhookRouter } from "./webhook.routes.js";
import { v1Router } from "./v1.routes.js";
import { mercadoPagoWebhookHandler } from "../controllers/mercadopago.controller.js";
import { appAgentRouter } from "./app-agent.routes.js";
import { appNumeracionesApiRouter } from "./app-numeraciones-api.routes.js";
import { webAgentRouter } from "./web-agent.routes.js";
import { adminApiRouter } from "./admin-api.routes.js";

export const apiRouter = Router();

apiRouter.post("/mercadopago/webhook", mercadoPagoWebhookHandler);
apiRouter.get("/mercadopago/webhook", mercadoPagoWebhookHandler);

apiRouter.use("/public", publicRouter);
apiRouter.use("/admin", adminApiRouter);
apiRouter.use("/v1", v1Router);
apiRouter.use("/auth", authRouter);
apiRouter.use("/sms", smsRouter);
apiRouter.use("/clients", clientsRouter);
apiRouter.use("/webhooks", webhookRouter);
apiRouter.use("/asmsc", balanceRouter);
apiRouter.use("/telegram", telegramRouter);
apiRouter.use("/app/agent", appAgentRouter);
apiRouter.use("/app", appNumeracionesApiRouter);
apiRouter.use("/web-agent", webAgentRouter);
