import { Router } from "express";
import {
  getAppApi,
  getAppBuySms,
  getAppCampaigns,
  getAppContacts,
  getAppDashboard,
  getAppInbox,
  getAppInvoices,
  getAppOrderDetail,
  getAppOrders,
  getAppReports,
  getAppRoot,
  getAppSendSms,
  getAppSettings,
  getAppSupport,
  getAppTemplates,
  getAppWallet,
  postAppBuySms,
} from "../controllers/app.controller.js";
import {
  getAppMercadoPagoContinuePay,
  getAppMercadoPagoReturn,
  postAppBuySmsMercadoPago,
} from "../controllers/app-payments.controller.js";
import { loadAdminSession } from "../middleware/admin-auth.js";
import { requireClientPanelPage } from "../middleware/client-panel-auth.js";

export const appRouter = Router();

appRouter.use(loadAdminSession);

appRouter.get("/", requireClientPanelPage, getAppRoot);
appRouter.get("/dashboard", requireClientPanelPage, getAppDashboard);

appRouter.get("/buy-sms", requireClientPanelPage, getAppBuySms);
appRouter.post("/buy-sms", requireClientPanelPage, postAppBuySms);
appRouter.post(
  "/buy-sms/mercadopago",
  requireClientPanelPage,
  postAppBuySmsMercadoPago,
);

appRouter.get("/payments/mercadopago/success", requireClientPanelPage, (req, res, next) =>
  getAppMercadoPagoReturn(req, res, next, "success"),
);
appRouter.get("/payments/mercadopago/failure", requireClientPanelPage, (req, res, next) =>
  getAppMercadoPagoReturn(req, res, next, "failure"),
);
appRouter.get("/payments/mercadopago/pending", requireClientPanelPage, (req, res, next) =>
  getAppMercadoPagoReturn(req, res, next, "pending"),
);
appRouter.get(
  "/orders/:id/continue-payment",
  requireClientPanelPage,
  getAppMercadoPagoContinuePay,
);

appRouter.get("/wallet", requireClientPanelPage, getAppWallet);
appRouter.get("/orders", requireClientPanelPage, getAppOrders);
appRouter.get("/orders/:id", requireClientPanelPage, getAppOrderDetail);

appRouter.get("/send-sms", requireClientPanelPage, getAppSendSms);
appRouter.get("/campaigns", requireClientPanelPage, getAppCampaigns);
appRouter.get("/inbox", requireClientPanelPage, getAppInbox);
appRouter.get("/contacts", requireClientPanelPage, getAppContacts);
appRouter.get("/templates", requireClientPanelPage, getAppTemplates);
appRouter.get("/reports", requireClientPanelPage, getAppReports);
appRouter.get("/invoices", requireClientPanelPage, getAppInvoices);
appRouter.get("/api", requireClientPanelPage, getAppApi);
appRouter.get("/support", requireClientPanelPage, getAppSupport);
appRouter.get("/settings", requireClientPanelPage, getAppSettings);
