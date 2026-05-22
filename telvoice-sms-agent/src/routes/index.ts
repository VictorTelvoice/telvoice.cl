import { Router } from "express";
import { balanceRouter } from "./balance.routes.js";
import { clientsRouter } from "./clients.routes.js";
import { publicRouter } from "./public.routes.js";
import { smsRouter } from "./sms.routes.js";
import { telegramRouter } from "./telegram.routes.js";
import { webhookRouter } from "./webhook.routes.js";

export const apiRouter = Router();

apiRouter.use("/public", publicRouter);
apiRouter.use("/sms", smsRouter);
apiRouter.use("/clients", clientsRouter);
apiRouter.use("/webhooks", webhookRouter);
apiRouter.use("/asmsc", balanceRouter);
apiRouter.use("/telegram", telegramRouter);
