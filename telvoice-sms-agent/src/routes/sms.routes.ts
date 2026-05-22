import { Router } from "express";
import {
  getMessageByIdHandler,
  getMessageByUidHandler,
  listMessagesHandler,
} from "../controllers/sms-message.controller.js";
import { sendTestHandler } from "../controllers/sms.controller.js";

export const smsRouter = Router();

smsRouter.post("/send-test", sendTestHandler);
smsRouter.get("/messages", listMessagesHandler);
smsRouter.get("/messages/by-uid/:uid", getMessageByUidHandler);
smsRouter.get("/messages/:id", getMessageByIdHandler);
