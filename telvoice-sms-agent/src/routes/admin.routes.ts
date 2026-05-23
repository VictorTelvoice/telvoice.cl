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
  getChatPage,
  getContactsPage,
  getInvoicesPage,
  getReportsPage,
  getTemplatesPage,
  redirectSendSmsAlias,
} from "../controllers/admin-sections.controller.js";
import {
  getSaApiKeysPage,
  getSaCampaignsPage,
  getSaClientsPage,
  getSaDlrPage,
  getSaMessagesPage,
  getSaProvidersPage,
  getSaRoutesPage,
  redirectSaBot,
} from "../controllers/admin-superadmin.controller.js";
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
  postMarkOrderPaid,
  postToggleSmsPackage,
  postUpdateSmsPackage,
  postWalletCredit,
  postWalletDebit,
  postWalletQuickCredit,
} from "../controllers/admin-wallet.controller.js";
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

export const adminRouter = Router();

adminRouter.use(loadAdminSession);

adminRouter.get("/forbidden", getAdminForbiddenPage);
adminRouter.get("/login", redirectIfAuthenticated, getLoginPage);
adminRouter.post("/login", postLogin);
adminRouter.get("/register", redirectIfAuthenticated, getRegisterPage);
adminRouter.post("/register", postRegister);
adminRouter.post("/logout", postLogout);

adminRouter.get("/", requireAdminPage, getDashboard);
adminRouter.get("/clients", requireAdminPage, getSaClientsPage);
adminRouter.get("/pricing", requireAdminPage, getSaPricingPage);
adminRouter.post("/pricing", requireAdminPage, postCreateSmsPackage);
adminRouter.post("/pricing/:id/update", requireAdminPage, postUpdateSmsPackage);
adminRouter.post("/pricing/:id/toggle", requireAdminPage, postToggleSmsPackage);
adminRouter.get("/campaigns", requireAdminPage, getSaCampaignsPage);
adminRouter.get("/messages", requireAdminPage, getSaMessagesPage);
adminRouter.get("/dlr", requireAdminPage, getSaDlrPage);
adminRouter.get("/providers", requireAdminPage, getSaProvidersPage);
adminRouter.get("/routes", requireAdminPage, getSaRoutesPage);
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
adminRouter.get("/invoices", requireAdminPage, getInvoicesPage);
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
