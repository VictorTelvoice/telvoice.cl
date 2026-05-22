import { Router } from "express";
import { telegramWebhookHandler } from "../controllers/telegram.controller.js";

export const telegramRouter = Router();

telegramRouter.post("/webhook", telegramWebhookHandler);
