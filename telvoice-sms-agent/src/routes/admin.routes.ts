import { Router } from "express";
import {
  getEditTelegramUserForm,
  getNewTelegramUserForm,
  getTestClientTelegramUsers,
  postCreateTelegramUser,
  postDeactivateTelegramUser,
  postDeleteTelegramUser,
  postEditTelegramUser,
  postTestTelegramUser,
} from "../controllers/admin-telegram-users.controller.js";
import {
  getAsmscBalancePage,
  getAsmscDiagnosticsPage,
  getCreditForm,
  getSendTestForm,
  postCredit,
  postSendTest,
  postSimulateDlr,
  postSimulateDlrFailed,
  getTestClientLedger,
  getTelegramDiagnosticsPage,
  getTelegramIntentTest,
  postTelegramDiagnosticsTest,
  postTelegramIntentTest,
} from "../controllers/admin-ops.controller.js";
import {
  getCalculatorTest,
  getLeadsList,
  getProductEditForm,
  getProductNewForm,
  getProductsList,
  postCalculatorTest,
  postCreateProduct,
  postEditProduct,
  postUpdateLeadStatus,
} from "../controllers/admin-commercial.controller.js";
import {
  getPricingTiersAdmin,
  getWebAgentLeads,
  getWebAgentQuotes,
  getWebAgentSessions,
  postUpdatePricingTier,
} from "../controllers/admin-web-agent.controller.js";
import {
  getKnowledgeEditForm,
  getKnowledgeList,
  getKnowledgeNewForm,
  getKnowledgeTest,
  postCreateKnowledge,
  postDeleteKnowledge,
  postEditKnowledge,
  postKnowledgeTest,
} from "../controllers/admin-knowledge.controller.js";
import {
  getAdminAgentCreateArticleForm,
  getAdminAgentFeedback,
  getAdminAgentFeedbackCreateArticleForm,
  getAdminAgentFeedbackDetail,
  getAdminAgentHub,
  getAdminAgentUnanswered,
  postAdminAgentCreateArticle,
  postAdminAgentFeedbackCreateArticle,
  postAdminAgentFeedbackBackfill,
  postAdminAgentFeedbackCreateUnanswered,
  postAdminAgentFeedbackIgnore,
  postAdminAgentFeedbackMarkReviewed,
  postAdminAgentFeedbackProposeAnswer,
  postAdminAgentIgnore,
  postAdminAgentMarkReviewed,
} from "../controllers/admin-agent-training.controller.js";
import {
  getAgentSalesConversationPage,
  getAgentSalesPage,
} from "../controllers/admin-agent-sales.controller.js";
import {
  getAdminTestPage,
  getAdminTelsimInboundPreview,
  postAdminTestQaSend,
} from "../controllers/admin-test.controller.js";
import {
  getAdminSupportPage,
  postAdminSupportTicketInternalNote,
  postAdminSupportTicketQuickAction,
  postAdminSupportTicketReply,
  postAdminSupportTicketUpdate,
} from "../controllers/admin-support.controller.js";
import {
  getAdminApiUsagePage,
  postAdminApiUsageKeyActivate,
  postAdminApiUsageKeyPause,
  postAdminApiUsageKeyRevoke,
  postAdminApiUsageKeyApproveProduction,
  postAdminApiUsageKeyRevokeProductionApproval,
  postAdminApiUsageRateLimitCreate,
  postAdminApiUsageRateLimitDisable,
  postAdminApiUsageRateLimitUpdate,
} from "../controllers/admin-api-usage.controller.js";
import {
  getChatPage,
  getContactsPage,
  getInvoicesPage,
  getAdminInvoiceDetailPage,
  getAdminInvoicePreviewPage,
  postAdminInvoiceResendEmail,
  postAdminInvoiceSendEmail,
  getReportsPage,
  getTemplatesPage,
  redirectSendSmsAlias,
} from "../controllers/admin-sections.controller.js";
import {
  getAdminBillingRecoveryPage,
  postRecoveryEmailMarkReviewed,
  postRecoveryEmailRetry,
  postRecoveryInvoiceSendEmail,
  postRecoveryOrderMarkReviewed,
  postRecoveryOrderSync,
  postRecoveryOrderUnmarkReviewed,
} from "../controllers/admin-billing-recovery.controller.js";
import {
  getAdminClientAuditPage,
  getAdminDataAuditReportJson,
  getAdminDataCleanupPage,
  postAdminDataCleanupApply,
  postAdminDataCleanupDryRun,
  postAdminDataCleanupGenerate,
} from "../controllers/admin-data-audit.controller.js";
import {
  getSaApiKeysPage,
  getSaCampaignsPage,
  getSaDlrPage,
  getSaMessagesPage,
  redirectSaBot,
} from "../controllers/admin-superadmin.controller.js";
import {
  getAdminCampaignSendPage,
  postAdminCampaignSend,
} from "../controllers/admin-campaign-send.controller.js";
import {
  getSaTrafficControlPage,
  getSaQueueSchedulerConfigJson,
  postPauseProvider,
  postPauseRoute,
  postResumeProvider,
  postResumeRoute,
  postTrafficQueueProcessTick,
  postUpdateProviderTraffic,
  postUpdateQueueSchedulerSettings,
} from "../controllers/admin-traffic-control.controller.js";
import {
  postAdminClientArchiveQa,
  postAdminClientReactivateSending,
  postAdminClientResendReceipt,
  postAdminClientResendWelcome,
  postAdminClientSuspendSending,
  postAdminClientUpdateProfile,
} from "../controllers/admin-client-actions.controller.js";
import {
  getSaClientDetailPageTelco,
  getSaClientsPageTelco,
  getSaProviderDetailPage,
  getSaProviderTestPage,
  getSaProvidersPageTelco,
  getSaRatePlanDetailPage,
  getSaRatePlansPage,
  getSaRoutesPageTelco,
  postAssignCompanyRatePlan,
  postCreateProvider,
  postCreateRatePlan,
  postCreateRatePlanDetail,
  postDeactivateRatePlanDetail,
  postCreateRoute,
  postUpdateRatePlanDetail,
  postUpdateRouteTraffic,
  postSaProviderTest,
  postToggleRoute,
  postUpdateCompanyTraffic,
  postUpdateRatePlanTraffic,
} from "../controllers/admin-sms-telco.controller.js";
import {
  getSaOrderDetailPage,
  getSaOrdersPage,
  getSaPricingPage,
  getSaWalletDetailPage,
  getSaWalletsPage,
  postCancelPendingOrder,
  postCreateOrder,
  postCreateSmsPackage,
  postCreditOrder,
  postSyncOrderBilling,
  postMarkOrderPaid,
  postToggleSmsPackage,
  postUpdateSmsPackage,
  postWalletCredit,
  postWalletDebit,
  postWalletQuickCredit,
} from "../controllers/admin-wallet.controller.js";
import {
  getAdminEmailLogsPage,
  postResendEmailLog,
  postResendOrderClaimEmail,
  postResendOrderInvoiceEmail,
} from "../controllers/admin-email-logs.controller.js";
import {
  getDashboard,
  getInboxPage,
  getLoginPage,
  getMessageDetail,
  getRegisterPage,
  getSettingsPage,
  getTestClientPage,
  postLogin,
  postLogout,
  postRegister,
} from "../controllers/admin.controller.js";
import {
  getAdminForbiddenPage,
  loadAdminSession,
  redirectIfAuthenticated,
  requireAdminPage,
} from "../middleware/admin-auth.js";
import {
  getWholesaleHub,
  getWholesaleCustomerEditForm,
  getWholesaleCustomerNewForm,
  getWholesaleCustomersList,
  getWholesaleOpportunitiesList,
  getWholesaleOpportunityEditForm,
  getWholesaleOpportunityNewForm,
  getWholesaleProviderEditForm,
  getWholesaleProviderNewForm,
  getWholesaleProvidersList,
  getWholesaleRateOfferEditForm,
  getWholesaleRateOfferNewForm,
  getWholesaleRateOffersList,
  getWholesaleRouteEditForm,
  getWholesaleRouteNewForm,
  getWholesaleRouteTestEditForm,
  getWholesaleRouteTestNewForm,
  getWholesaleRouteTestsList,
  getWholesaleRoutesList,
  postCreateWholesaleCustomer,
  postCreateWholesaleOpportunity,
  postCreateWholesaleProvider,
  postCreateWholesaleRateOffer,
  postCreateWholesaleRoute,
  postCreateWholesaleRouteTest,
  postDeleteWholesaleCustomer,
  postDeleteWholesaleOpportunity,
  postDeleteWholesaleProvider,
  postDeleteWholesaleRateOffer,
  postDeleteWholesaleRoute,
  postDeleteWholesaleRouteTest,
  postEditWholesaleCustomer,
  postEditWholesaleOpportunity,
  postEditWholesaleProvider,
  postEditWholesaleRateOffer,
  postEditWholesaleRoute,
  postEditWholesaleRouteTest,
} from "../controllers/admin-wholesale.controller.js";

export const adminRouter = Router();

adminRouter.use(loadAdminSession);

adminRouter.get("/forbidden", getAdminForbiddenPage);
adminRouter.get("/login", redirectIfAuthenticated, getLoginPage);
adminRouter.post("/login", postLogin);
adminRouter.get("/register", redirectIfAuthenticated, getRegisterPage);
adminRouter.post("/register", postRegister);
adminRouter.post("/logout", postLogout);

adminRouter.get("/", requireAdminPage, getDashboard);
adminRouter.get("/clients", requireAdminPage, getSaClientsPageTelco);
adminRouter.post(
  "/clients/:companyId/actions/update-profile",
  requireAdminPage,
  postAdminClientUpdateProfile,
);
adminRouter.post(
  "/clients/:companyId/actions/suspend-sending",
  requireAdminPage,
  postAdminClientSuspendSending,
);
adminRouter.post(
  "/clients/:companyId/actions/reactivate-sending",
  requireAdminPage,
  postAdminClientReactivateSending,
);
adminRouter.post(
  "/clients/:companyId/actions/resend-welcome",
  requireAdminPage,
  postAdminClientResendWelcome,
);
adminRouter.post(
  "/clients/:companyId/actions/resend-receipt",
  requireAdminPage,
  postAdminClientResendReceipt,
);
adminRouter.post(
  "/clients/:companyId/actions/archive-qa",
  requireAdminPage,
  postAdminClientArchiveQa,
);
adminRouter.get("/pricing", requireAdminPage, getSaPricingPage);
adminRouter.post("/pricing", requireAdminPage, postCreateSmsPackage);
adminRouter.post("/pricing/:id/update", requireAdminPage, postUpdateSmsPackage);
adminRouter.post("/pricing/:id/toggle", requireAdminPage, postToggleSmsPackage);
adminRouter.get("/campaigns", requireAdminPage, getSaCampaignsPage);
adminRouter.get("/campaigns/send", requireAdminPage, getAdminCampaignSendPage);
adminRouter.post("/campaigns/send", requireAdminPage, postAdminCampaignSend);
adminRouter.get("/messages", requireAdminPage, getSaMessagesPage);
adminRouter.get("/dlr", requireAdminPage, getSaDlrPage);
adminRouter.get("/providers", requireAdminPage, getSaProvidersPageTelco);
adminRouter.post("/providers", requireAdminPage, postCreateProvider);
adminRouter.get("/providers/:id", requireAdminPage, getSaProviderDetailPage);
adminRouter.get("/providers/:id/test", requireAdminPage, getSaProviderTestPage);
adminRouter.post("/providers/:id/test", requireAdminPage, postSaProviderTest);
adminRouter.get("/routes", requireAdminPage, getSaRoutesPageTelco);
adminRouter.post("/routes", requireAdminPage, postCreateRoute);
adminRouter.post("/routes/:id/status", requireAdminPage, postToggleRoute);
adminRouter.get("/traffic-control", requireAdminPage, getSaTrafficControlPage);
adminRouter.get(
  "/traffic-control/scheduler-config.json",
  requireAdminPage,
  getSaQueueSchedulerConfigJson,
);
adminRouter.get("/test", requireAdminPage, getAdminTestPage);
adminRouter.get("/test/telsim-preview", requireAdminPage, getAdminTelsimInboundPreview);
adminRouter.post("/test/qa-send", requireAdminPage, postAdminTestQaSend);
adminRouter.post(
  "/traffic-control/queue/process-tick",
  requireAdminPage,
  postTrafficQueueProcessTick,
);
adminRouter.post(
  "/traffic-control/scheduler",
  requireAdminPage,
  postUpdateQueueSchedulerSettings,
);
adminRouter.post("/routes/:id/pause", requireAdminPage, postPauseRoute);
adminRouter.post("/routes/:id/resume", requireAdminPage, postResumeRoute);
adminRouter.post("/providers/:id/pause", requireAdminPage, postPauseProvider);
adminRouter.post("/providers/:id/resume", requireAdminPage, postResumeProvider);
adminRouter.post(
  "/providers/:id/traffic",
  requireAdminPage,
  postUpdateProviderTraffic,
);
adminRouter.get("/rate-plans", requireAdminPage, getSaRatePlansPage);
adminRouter.post("/rate-plans", requireAdminPage, postCreateRatePlan);
adminRouter.get("/rate-plans/:id", requireAdminPage, getSaRatePlanDetailPage);
adminRouter.post("/rate-plans/:id/details", requireAdminPage, postCreateRatePlanDetail);
adminRouter.post(
  "/rate-plans/:id/details/:detailId",
  requireAdminPage,
  postUpdateRatePlanDetail,
);
adminRouter.post(
  "/rate-plans/:id/details/:detailId/deactivate",
  requireAdminPage,
  postDeactivateRatePlanDetail,
);
adminRouter.post(
  "/routes/:id/traffic",
  requireAdminPage,
  postUpdateRouteTraffic,
);
adminRouter.post(
  "/wallets/:companyId/rate-plan",
  requireAdminPage,
  postAssignCompanyRatePlan,
);
adminRouter.post(
  "/wallets/:companyId/traffic",
  requireAdminPage,
  postUpdateCompanyTraffic,
);
adminRouter.post(
  "/rate-plans/:id/traffic",
  requireAdminPage,
  postUpdateRatePlanTraffic,
);
adminRouter.get("/wholesale", requireAdminPage, getWholesaleHub);
adminRouter.get("/wholesale/providers", requireAdminPage, getWholesaleProvidersList);
adminRouter.get("/wholesale/providers/new", requireAdminPage, getWholesaleProviderNewForm);
adminRouter.post("/wholesale/providers", requireAdminPage, postCreateWholesaleProvider);
adminRouter.get(
  "/wholesale/providers/:id/edit",
  requireAdminPage,
  getWholesaleProviderEditForm,
);
adminRouter.post(
  "/wholesale/providers/:id/edit",
  requireAdminPage,
  postEditWholesaleProvider,
);
adminRouter.post(
  "/wholesale/providers/:id/delete",
  requireAdminPage,
  postDeleteWholesaleProvider,
);
adminRouter.get("/wholesale/routes", requireAdminPage, getWholesaleRoutesList);
adminRouter.get("/wholesale/routes/new", requireAdminPage, getWholesaleRouteNewForm);
adminRouter.post("/wholesale/routes", requireAdminPage, postCreateWholesaleRoute);
adminRouter.get("/wholesale/routes/:id/edit", requireAdminPage, getWholesaleRouteEditForm);
adminRouter.post("/wholesale/routes/:id/edit", requireAdminPage, postEditWholesaleRoute);
adminRouter.post("/wholesale/routes/:id/delete", requireAdminPage, postDeleteWholesaleRoute);
adminRouter.get("/wholesale/rates", requireAdminPage, getWholesaleRateOffersList);
adminRouter.get("/wholesale/rates/new", requireAdminPage, getWholesaleRateOfferNewForm);
adminRouter.post("/wholesale/rates", requireAdminPage, postCreateWholesaleRateOffer);
adminRouter.get("/wholesale/rates/:id/edit", requireAdminPage, getWholesaleRateOfferEditForm);
adminRouter.post("/wholesale/rates/:id/edit", requireAdminPage, postEditWholesaleRateOffer);
adminRouter.post("/wholesale/rates/:id/delete", requireAdminPage, postDeleteWholesaleRateOffer);
adminRouter.get("/wholesale/route-tests", requireAdminPage, getWholesaleRouteTestsList);
adminRouter.get(
  "/wholesale/route-tests/new",
  requireAdminPage,
  getWholesaleRouteTestNewForm,
);
adminRouter.post("/wholesale/route-tests", requireAdminPage, postCreateWholesaleRouteTest);
adminRouter.get(
  "/wholesale/route-tests/:id/edit",
  requireAdminPage,
  getWholesaleRouteTestEditForm,
);
adminRouter.post(
  "/wholesale/route-tests/:id/edit",
  requireAdminPage,
  postEditWholesaleRouteTest,
);
adminRouter.post(
  "/wholesale/route-tests/:id/delete",
  requireAdminPage,
  postDeleteWholesaleRouteTest,
);
adminRouter.get("/wholesale/customers", requireAdminPage, getWholesaleCustomersList);
adminRouter.get("/wholesale/customers/new", requireAdminPage, getWholesaleCustomerNewForm);
adminRouter.post("/wholesale/customers", requireAdminPage, postCreateWholesaleCustomer);
adminRouter.get(
  "/wholesale/customers/:id/edit",
  requireAdminPage,
  getWholesaleCustomerEditForm,
);
adminRouter.post(
  "/wholesale/customers/:id/edit",
  requireAdminPage,
  postEditWholesaleCustomer,
);
adminRouter.post(
  "/wholesale/customers/:id/delete",
  requireAdminPage,
  postDeleteWholesaleCustomer,
);
adminRouter.get("/wholesale/opportunities", requireAdminPage, getWholesaleOpportunitiesList);
adminRouter.get(
  "/wholesale/opportunities/new",
  requireAdminPage,
  getWholesaleOpportunityNewForm,
);
adminRouter.post(
  "/wholesale/opportunities",
  requireAdminPage,
  postCreateWholesaleOpportunity,
);
adminRouter.get(
  "/wholesale/opportunities/:id/edit",
  requireAdminPage,
  getWholesaleOpportunityEditForm,
);
adminRouter.post(
  "/wholesale/opportunities/:id/edit",
  requireAdminPage,
  postEditWholesaleOpportunity,
);
adminRouter.post(
  "/wholesale/opportunities/:id/delete",
  requireAdminPage,
  postDeleteWholesaleOpportunity,
);
adminRouter.get("/orders", requireAdminPage, getSaOrdersPage);
adminRouter.get("/orders/:id", requireAdminPage, getSaOrderDetailPage);
adminRouter.post("/orders", requireAdminPage, postCreateOrder);
adminRouter.post("/orders/:id/mark-paid", requireAdminPage, postMarkOrderPaid);
adminRouter.post(
  "/orders/:id/cancel",
  requireAdminPage,
  postCancelPendingOrder,
);
adminRouter.post("/orders/:id/credit", requireAdminPage, postCreditOrder);
adminRouter.post(
  "/orders/:id/sync-billing",
  requireAdminPage,
  postSyncOrderBilling,
);
adminRouter.post(
  "/orders/:id/resend-claim-email",
  requireAdminPage,
  postResendOrderClaimEmail,
);
adminRouter.post(
  "/orders/:id/resend-invoice-email",
  requireAdminPage,
  postResendOrderInvoiceEmail,
);
adminRouter.get("/email-logs", requireAdminPage, getAdminEmailLogsPage);
adminRouter.post(
  "/email-logs/:id/resend",
  requireAdminPage,
  postResendEmailLog,
);
adminRouter.get("/wallets", requireAdminPage, getSaWalletsPage);
adminRouter.post("/wallets/quick-credit", requireAdminPage, postWalletQuickCredit);
adminRouter.get("/wallets/:companyId", requireAdminPage, getSaWalletDetailPage);
adminRouter.post("/wallets/:companyId/credit", requireAdminPage, postWalletCredit);
adminRouter.post("/wallets/:companyId/debit", requireAdminPage, postWalletDebit);
adminRouter.get("/api", requireAdminPage, getSaApiKeysPage);
adminRouter.get("/bot", requireAdminPage, redirectSaBot);
adminRouter.get("/inbox", requireAdminPage, getInboxPage);
adminRouter.get("/reports", requireAdminPage, getReportsPage);
adminRouter.get("/contacts", requireAdminPage, getContactsPage);
adminRouter.get("/support", requireAdminPage, getAdminSupportPage);
adminRouter.post(
  "/support/tickets/:id/update",
  requireAdminPage,
  postAdminSupportTicketUpdate,
);
adminRouter.post(
  "/support/tickets/:id/reply",
  requireAdminPage,
  postAdminSupportTicketReply,
);
adminRouter.post(
  "/support/tickets/:id/internal-note",
  requireAdminPage,
  postAdminSupportTicketInternalNote,
);
adminRouter.post(
  "/support/tickets/:id/quick-action",
  requireAdminPage,
  postAdminSupportTicketQuickAction,
);
adminRouter.get("/api-usage", requireAdminPage, getAdminApiUsagePage);
adminRouter.post(
  "/api-usage/keys/:id/pause",
  requireAdminPage,
  postAdminApiUsageKeyPause,
);
adminRouter.post(
  "/api-usage/keys/:id/activate",
  requireAdminPage,
  postAdminApiUsageKeyActivate,
);
adminRouter.post(
  "/api-usage/keys/:id/revoke",
  requireAdminPage,
  postAdminApiUsageKeyRevoke,
);
adminRouter.post(
  "/api-usage/keys/:id/approve-production",
  requireAdminPage,
  postAdminApiUsageKeyApproveProduction,
);
adminRouter.post(
  "/api-usage/keys/:id/revoke-production-approval",
  requireAdminPage,
  postAdminApiUsageKeyRevokeProductionApproval,
);
adminRouter.post(
  "/api-usage/rate-limits",
  requireAdminPage,
  postAdminApiUsageRateLimitCreate,
);
adminRouter.post(
  "/api-usage/rate-limits/:id",
  requireAdminPage,
  postAdminApiUsageRateLimitUpdate,
);
adminRouter.post(
  "/api-usage/rate-limits/:id/disable",
  requireAdminPage,
  postAdminApiUsageRateLimitDisable,
);
adminRouter.get("/invoices", requireAdminPage, getInvoicesPage);
adminRouter.get("/invoices/recovery", requireAdminPage, getAdminBillingRecoveryPage);
adminRouter.get("/data-cleanup", requireAdminPage, getAdminDataCleanupPage);
adminRouter.get("/data-cleanup/client-audit", requireAdminPage, getAdminClientAuditPage);
adminRouter.get("/data-cleanup/report.json", requireAdminPage, getAdminDataAuditReportJson);
adminRouter.post("/data-cleanup/generate", requireAdminPage, postAdminDataCleanupGenerate);
adminRouter.post("/data-cleanup/dry-run", requireAdminPage, postAdminDataCleanupDryRun);
adminRouter.post("/data-cleanup/apply", requireAdminPage, postAdminDataCleanupApply);
adminRouter.post(
  "/billing/recovery/orders/:orderId/sync",
  requireAdminPage,
  postRecoveryOrderSync,
);
adminRouter.post(
  "/billing/recovery/orders/:orderId/mark-reviewed",
  requireAdminPage,
  postRecoveryOrderMarkReviewed,
);
adminRouter.post(
  "/billing/recovery/orders/:orderId/unmark-reviewed",
  requireAdminPage,
  postRecoveryOrderUnmarkReviewed,
);
adminRouter.post(
  "/billing/recovery/invoices/:invoiceId/send-email",
  requireAdminPage,
  postRecoveryInvoiceSendEmail,
);
adminRouter.post(
  "/billing/recovery/emails/:emailLogId/retry",
  requireAdminPage,
  postRecoveryEmailRetry,
);
adminRouter.post(
  "/billing/recovery/emails/:emailLogId/mark-reviewed",
  requireAdminPage,
  postRecoveryEmailMarkReviewed,
);
adminRouter.get("/invoices/:id/preview", requireAdminPage, getAdminInvoicePreviewPage);
adminRouter.post(
  "/invoices/:id/send-email",
  requireAdminPage,
  postAdminInvoiceSendEmail,
);
adminRouter.post(
  "/invoices/:id/resend-email",
  requireAdminPage,
  postAdminInvoiceResendEmail,
);
adminRouter.get("/invoices/:id", requireAdminPage, getAdminInvoiceDetailPage);
adminRouter.get("/templates", requireAdminPage, getTemplatesPage);
adminRouter.get("/chat", requireAdminPage, getChatPage);
adminRouter.get("/send-sms", requireAdminPage, redirectSendSmsAlias);
adminRouter.get("/sms/send-test", requireAdminPage, getSendTestForm);
adminRouter.post("/sms/send-test", requireAdminPage, postSendTest);
adminRouter.get("/clients/test/credit", requireAdminPage, getCreditForm);
adminRouter.post("/clients/test/credit", requireAdminPage, postCredit);
adminRouter.get("/clients/test/ledger", requireAdminPage, getTestClientLedger);
adminRouter.get(
  "/clients/test/telegram-users",
  requireAdminPage,
  getTestClientTelegramUsers,
);
adminRouter.get(
  "/clients/test/telegram-users/new",
  requireAdminPage,
  getNewTelegramUserForm,
);
adminRouter.post(
  "/clients/test/telegram-users",
  requireAdminPage,
  postCreateTelegramUser,
);
adminRouter.get(
  "/clients/test/telegram-users/:id/edit",
  requireAdminPage,
  getEditTelegramUserForm,
);
adminRouter.post(
  "/clients/test/telegram-users/:id/edit",
  requireAdminPage,
  postEditTelegramUser,
);
adminRouter.post(
  "/clients/test/telegram-users/:id/deactivate",
  requireAdminPage,
  postDeactivateTelegramUser,
);
adminRouter.post(
  "/clients/test/telegram-users/:id/delete",
  requireAdminPage,
  postDeleteTelegramUser,
);
adminRouter.get("/calculator", requireAdminPage, getCalculatorTest);
adminRouter.post("/calculator", requireAdminPage, postCalculatorTest);
adminRouter.get("/products", requireAdminPage, getProductsList);
adminRouter.get("/products/new", requireAdminPage, getProductNewForm);
adminRouter.post("/products", requireAdminPage, postCreateProduct);
adminRouter.get("/products/:id/edit", requireAdminPage, getProductEditForm);
adminRouter.post("/products/:id/edit", requireAdminPage, postEditProduct);
adminRouter.get("/leads", requireAdminPage, getLeadsList);
adminRouter.post("/leads/:id/status", requireAdminPage, postUpdateLeadStatus);
adminRouter.get("/web-agent/leads", requireAdminPage, getWebAgentLeads);
adminRouter.get("/web-agent/sessions", requireAdminPage, getWebAgentSessions);
adminRouter.get("/web-agent/quotes", requireAdminPage, getWebAgentQuotes);
adminRouter.get("/pricing-tiers", requireAdminPage, getPricingTiersAdmin);
adminRouter.post(
  "/pricing-tiers/:id/edit",
  requireAdminPage,
  postUpdatePricingTier,
);
adminRouter.get("/knowledge", requireAdminPage, getKnowledgeList);
adminRouter.get("/knowledge/test", requireAdminPage, getKnowledgeTest);
adminRouter.post("/knowledge/test", requireAdminPage, postKnowledgeTest);
adminRouter.get("/knowledge/new", requireAdminPage, getKnowledgeNewForm);
adminRouter.post("/knowledge", requireAdminPage, postCreateKnowledge);
adminRouter.get("/knowledge/:id/edit", requireAdminPage, getKnowledgeEditForm);
adminRouter.post("/knowledge/:id/edit", requireAdminPage, postEditKnowledge);
adminRouter.post("/knowledge/:id/delete", requireAdminPage, postDeleteKnowledge);
adminRouter.get("/agent-sales", requireAdminPage, getAgentSalesPage);
adminRouter.get(
  "/agent-sales/conversations/:sessionId",
  requireAdminPage,
  getAgentSalesConversationPage,
);
adminRouter.get("/agent-training", requireAdminPage, getAdminAgentHub);
adminRouter.get("/agent-training/feedback", requireAdminPage, getAdminAgentFeedback);
adminRouter.get(
  "/agent-training/feedback/:id/create-article",
  requireAdminPage,
  getAdminAgentFeedbackCreateArticleForm,
);
adminRouter.post(
  "/agent-training/feedback/:id/create-article",
  requireAdminPage,
  postAdminAgentFeedbackCreateArticle,
);
adminRouter.post(
  "/agent-training/feedback/:id/mark-reviewed",
  requireAdminPage,
  postAdminAgentFeedbackMarkReviewed,
);
adminRouter.post(
  "/agent-training/feedback/:id/ignore",
  requireAdminPage,
  postAdminAgentFeedbackIgnore,
);
adminRouter.post(
  "/agent-training/feedback/:id/propose-answer",
  requireAdminPage,
  postAdminAgentFeedbackProposeAnswer,
);
adminRouter.post(
  "/agent-training/feedback/:id/create-unanswered",
  requireAdminPage,
  postAdminAgentFeedbackBackfill,
  postAdminAgentFeedbackCreateUnanswered,
);
adminRouter.post(
  "/agent-training/feedback/:id/backfill",
  requireAdminPage,
  postAdminAgentFeedbackBackfill,
);
adminRouter.get(
  "/agent-training/feedback/:id",
  requireAdminPage,
  getAdminAgentFeedbackDetail,
);
adminRouter.get(
  "/agent-training/unanswered",
  requireAdminPage,
  getAdminAgentUnanswered,
);
adminRouter.get(
  "/agent-training/unanswered/:id/create-article",
  requireAdminPage,
  getAdminAgentCreateArticleForm,
);
adminRouter.post(
  "/agent-training/unanswered/:id/create-article",
  requireAdminPage,
  postAdminAgentCreateArticle,
);
adminRouter.post(
  "/agent-training/unanswered/:id/mark-reviewed",
  requireAdminPage,
  postAdminAgentMarkReviewed,
);
adminRouter.post(
  "/agent-training/unanswered/:id/ignore",
  requireAdminPage,
  postAdminAgentIgnore,
);
adminRouter.get("/settings", requireAdminPage, getSettingsPage);
adminRouter.get("/asmsc/balance", requireAdminPage, getAsmscBalancePage);
adminRouter.get("/asmsc/diagnostics", requireAdminPage, getAsmscDiagnosticsPage);
adminRouter.get("/telegram/diagnostics", requireAdminPage, getTelegramDiagnosticsPage);
adminRouter.get("/telegram/test-intent", requireAdminPage, getTelegramIntentTest);
adminRouter.post("/telegram/test-intent", requireAdminPage, postTelegramIntentTest);
adminRouter.post(
  "/telegram/diagnostics/test",
  requireAdminPage,
  postTelegramDiagnosticsTest,
);
adminRouter.post(
  "/clients/test/telegram-users/:id/test",
  requireAdminPage,
  postTestTelegramUser,
);
adminRouter.post(
  "/messages/:id/simulate-dlr",
  requireAdminPage,
  postSimulateDlr,
);
adminRouter.post(
  "/messages/:id/simulate-dlr-failed",
  requireAdminPage,
  postSimulateDlrFailed,
);
adminRouter.get("/messages/:id", requireAdminPage, getMessageDetail);
adminRouter.get("/clients/test", requireAdminPage, getTestClientPage);
adminRouter.get("/clients/:companyId", requireAdminPage, getSaClientDetailPageTelco);
