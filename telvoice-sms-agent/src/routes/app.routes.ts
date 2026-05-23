import { Router } from "express";
import {
  getAppHome,
  getAppSectionPlaceholder,
} from "../controllers/app.controller.js";
import { loadAdminSession } from "../middleware/admin-auth.js";
import { requireClientPanelPage } from "../middleware/client-panel-auth.js";

export const appRouter = Router();

appRouter.use(loadAdminSession);

const clientSections = [
  "dashboard",
  "buy-sms",
  "send-sms",
  "campaigns",
  "inbox",
  "contacts",
  "templates",
  "reports",
  "invoices",
  "api",
  "support",
  "settings",
] as const;

appRouter.get("/", requireClientPanelPage, getAppHome);

for (const section of clientSections) {
  appRouter.get(`/${section}`, requireClientPanelPage, getAppSectionPlaceholder);
}
