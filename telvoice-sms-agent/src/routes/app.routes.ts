import { Router } from "express";
import {
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
  postAppDuplicateContactList,
  postAppDeleteContactList,
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
  getAppManual,
  getAppManualPdf,
  getAppSupport,
  postAppSupportTicket,
  postAppSupportTicketReply,
  postAppSupportTicketResolve,
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
import {
  getAppApi,
  getAppApiDocs,
  getAppApiDocsPdf,
  postAppApiKeyRegenerate,
  postAppApiSmppRequest,
  postAppApiWebhook,
  postAppApiWebhookTest,
} from "../controllers/app-api.controller.js";
import {
  getAppApiKeysJson,
  postAppApiKeyActivate,
  postAppApiKeyCreate,
  postAppApiKeyName,
  postAppApiKeyPause,
  postAppApiKeyRevoke,
  postAppApiKeyScopes,
} from "../controllers/app-api-keys.controller.js";
import {
  getAppSettings,
  postAppSettings,
} from "../controllers/app-settings.controller.js";
import {
  getAppTemplates,
  postAppSmsTemplate,
  postAppSmsTemplateDelete,
  postAppSmsTemplateDuplicate,
  postAppSmsTemplateUpdate,
} from "../controllers/app-templates.controller.js";
import { postClientLogout } from "../controllers/admin.controller.js";
import { loadClientSession } from "../middleware/admin-auth.js";
import { requireClientPanelPage } from "../middleware/client-panel-auth.js";

export const appRouter = Router();

appRouter.use(loadClientSession);
appRouter.post("/logout", postClientLogout);

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
appRouter.post(
  "/contacts/lists/:id/duplicate",
  requireClientPanelPage,
  postAppDuplicateContactList,
);
appRouter.post(
  "/contacts/lists/:id/delete",
  requireClientPanelPage,
  postAppDeleteContactList,
);
appRouter.get("/templates", requireClientPanelPage, getAppTemplates);
appRouter.post("/templates", requireClientPanelPage, postAppSmsTemplate);
appRouter.post(
  "/templates/:id/update",
  requireClientPanelPage,
  postAppSmsTemplateUpdate,
);
appRouter.post(
  "/templates/:id/delete",
  requireClientPanelPage,
  postAppSmsTemplateDelete,
);
appRouter.post(
  "/templates/:id/duplicate",
  requireClientPanelPage,
  postAppSmsTemplateDuplicate,
);
appRouter.get("/reports", requireClientPanelPage, getAppReports);
appRouter.get("/reports/export.csv", requireClientPanelPage, getAppReportsExportCsv);
appRouter.get("/invoices", requireClientPanelPage, getAppInvoices);
appRouter.get("/invoices/:id/preview", requireClientPanelPage, getAppInvoicePreview);
appRouter.get("/invoices/:id", requireClientPanelPage, getAppInvoiceDetail);
appRouter.get("/api", requireClientPanelPage, getAppApi);
appRouter.get("/api/docs", requireClientPanelPage, getAppApiDocs);
appRouter.get("/api/docs.pdf", requireClientPanelPage, getAppApiDocsPdf);
appRouter.get("/api/keys", requireClientPanelPage, getAppApiKeysJson);
appRouter.post("/api/keys", requireClientPanelPage, postAppApiKeyCreate);
appRouter.post("/api/keys/:id/pause", requireClientPanelPage, postAppApiKeyPause);
appRouter.post("/api/keys/:id/activate", requireClientPanelPage, postAppApiKeyActivate);
appRouter.post("/api/keys/:id/revoke", requireClientPanelPage, postAppApiKeyRevoke);
appRouter.post("/api/keys/:id/scopes", requireClientPanelPage, postAppApiKeyScopes);
appRouter.post("/api/keys/:id/name", requireClientPanelPage, postAppApiKeyName);
appRouter.post("/api/key/regenerate", requireClientPanelPage, postAppApiKeyRegenerate);
appRouter.post("/api/webhook", requireClientPanelPage, postAppApiWebhook);
appRouter.post("/api/webhook/test", requireClientPanelPage, postAppApiWebhookTest);
appRouter.post("/api/smpp/request", requireClientPanelPage, postAppApiSmppRequest);
appRouter.get("/support/manual", requireClientPanelPage, getAppManual);
appRouter.get("/support/manual.pdf", requireClientPanelPage, getAppManualPdf);
appRouter.get("/manual", requireClientPanelPage, (_req, res) => {
  res.redirect(301, "/app/support/manual");
});
appRouter.get("/manual.pdf", requireClientPanelPage, (_req, res) => {
  res.redirect(301, "/app/support/manual.pdf");
});
appRouter.get("/support", requireClientPanelPage, getAppSupport);
appRouter.post("/support/tickets", requireClientPanelPage, postAppSupportTicket);
appRouter.post(
  "/support/tickets/:id/reply",
  requireClientPanelPage,
  postAppSupportTicketReply,
);
appRouter.post(
  "/support/tickets/:id/resolve",
  requireClientPanelPage,
  postAppSupportTicketResolve,
);
appRouter.get("/settings", requireClientPanelPage, getAppSettings);
appRouter.post("/settings", requireClientPanelPage, postAppSettings);
