import { Router } from "express";
import {
  getAppApi,
  getAppBuySms,
  getAppCampaigns,
  getAppCampaignDetail,
  getAppCampaignNew,
  postAppCampaignNewPreview,
  postAppCampaignDraft,
  postAppCampaignExecuteMock,
  postAppCampaignLaunchLive,
  getAppContacts,
  getAppContactsImport,
  postAppContactsImportPreview,
  postAppContactsImportConfirm,
  postAppCreateContactTag,
  postAppBulkAssignTag,
  postAppBulkMoveList,
  postAppBulkContactStatus,
  postAppCreateContact,
  postAppCreateContactList,
  getAppDashboard,
  getAppInbox,
  getAppInvoices,
  getAppInvoiceDetail,
  getAppInvoicePreview,
  getAppOrderDetail,
  getAppOrders,
  getAppReports,
  getAppReportsExportCsv,
  getAppRoot,
  getAppSendSms,
  postAppSendSms,
  getAppSettings,
  getAppSupport,
  getAppTemplates,
  getAppWallet,
  getAppWalletPaymentCard,
  postAppWalletPaymentCard,
  postAppWalletPaymentCardLink,
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
appRouter.get("/wallet/payment-card", requireClientPanelPage, getAppWalletPaymentCard);
appRouter.post("/wallet/payment-card", requireClientPanelPage, postAppWalletPaymentCard);
appRouter.post(
  "/wallet/payment-card/link",
  requireClientPanelPage,
  postAppWalletPaymentCardLink,
);
appRouter.get("/orders", requireClientPanelPage, getAppOrders);
appRouter.get("/orders/:id", requireClientPanelPage, getAppOrderDetail);

appRouter.get("/send-sms", requireClientPanelPage, getAppSendSms);
appRouter.post("/send-sms", requireClientPanelPage, postAppSendSms);
appRouter.get("/campaigns/new", requireClientPanelPage, getAppCampaignNew);
appRouter.post(
  "/campaigns/new/preview",
  requireClientPanelPage,
  postAppCampaignNewPreview,
);
appRouter.post("/campaigns/drafts", requireClientPanelPage, postAppCampaignDraft);
appRouter.post(
  "/campaigns/:id/execute-mock",
  requireClientPanelPage,
  postAppCampaignExecuteMock,
);
appRouter.post(
  "/campaigns/:id/launch-live",
  requireClientPanelPage,
  postAppCampaignLaunchLive,
);
appRouter.get("/campaigns/:id", requireClientPanelPage, getAppCampaignDetail);
appRouter.get("/campaigns", requireClientPanelPage, getAppCampaigns);
appRouter.get("/inbox", requireClientPanelPage, getAppInbox);
appRouter.get("/contacts/import", requireClientPanelPage, getAppContactsImport);
appRouter.post(
  "/contacts/import/preview",
  requireClientPanelPage,
  postAppContactsImportPreview,
);
appRouter.post(
  "/contacts/import/confirm",
  requireClientPanelPage,
  postAppContactsImportConfirm,
);
appRouter.post("/contacts/tags", requireClientPanelPage, postAppCreateContactTag);
appRouter.post(
  "/contacts/bulk/assign-tag",
  requireClientPanelPage,
  postAppBulkAssignTag,
);
appRouter.post(
  "/contacts/bulk/move-list",
  requireClientPanelPage,
  postAppBulkMoveList,
);
appRouter.post(
  "/contacts/bulk/status",
  requireClientPanelPage,
  postAppBulkContactStatus,
);
appRouter.get("/contacts", requireClientPanelPage, getAppContacts);
appRouter.post("/contacts", requireClientPanelPage, postAppCreateContact);
appRouter.post("/contacts/lists", requireClientPanelPage, postAppCreateContactList);
appRouter.get("/templates", requireClientPanelPage, getAppTemplates);
appRouter.get("/reports", requireClientPanelPage, getAppReports);
appRouter.get("/reports/export.csv", requireClientPanelPage, getAppReportsExportCsv);
appRouter.get("/invoices", requireClientPanelPage, getAppInvoices);
appRouter.get("/invoices/:id/preview", requireClientPanelPage, getAppInvoicePreview);
appRouter.get("/invoices/:id", requireClientPanelPage, getAppInvoiceDetail);
appRouter.get("/api", requireClientPanelPage, getAppApi);
appRouter.get("/support", requireClientPanelPage, getAppSupport);
appRouter.get("/settings", requireClientPanelPage, getAppSettings);
