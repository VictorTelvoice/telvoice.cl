import cookieParser from "cookie-parser";
import express, { type Request, type Response } from "express";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { adminRouter } from "./routes/admin.routes.js";
import { appRouter } from "./routes/app.routes.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { landingPublicCors } from "./middleware/landing-public-cors.js";
import { hostRoutingMiddleware } from "./middleware/host-routing.js";
import {
  loadAdminSession,
  loadClientSession,
  redirectIfAuthenticated,
} from "./middleware/admin-auth.js";
import {
  getLoginPage,
  postLogin,
} from "./controllers/admin.controller.js";
import {
  canAccessAdmin,
  canAccessClient,
  subjectFromAdmin,
} from "./auth/authorization.js";
import {
  buildAgentPlanDashboardPath,
  isAgentPlanIntentQuery,
  parseAgentPlanCode,
  parseSafeAppNextPath,
} from "./utils/agent-plan-intent.js";
import { env } from "./config/env.js";
import { isAdminPanelHost } from "./utils/panel-host.js";
import type { RequestWithRawBody } from "./types/express-request.js";
import {
  getAuthCallbackPage,
  getClaimManualReviewPage,
  getClientLoginPage,
} from "./controllers/client-google-auth.controller.js";
import { getCheckoutSuccessPage } from "./controllers/checkout-success.controller.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

const publicDir = path.join(moduleDir, "..", "public");

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(cookieParser());
  app.use(
    express.json({
      limit: "16mb",
      verify: (req: Request, _res, buf) => {
        const path = req.originalUrl ?? req.url ?? "";
        if (path.includes("/webhooks/telsim")) {
          (req as RequestWithRawBody).rawBody = buf.toString("utf8");
        }
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(publicDir, { maxAge: "7d", etag: true }));

  app.get("/health", (_req, res) => {
    let build: string | undefined;
    try {
      const shaPath = path.join(moduleDir, "build-sha.txt");
      if (existsSync(shaPath)) {
        build = readFileSync(shaPath, "utf8").trim();
      }
    } catch {
      // ignore
    }
    if (!build) {
      build = env.deploy.gitSha || undefined;
    }
    res.json({
      success: true,
      service: "telvoice-sms-agent",
      status: "ok",
      ...(build ? { build } : {}),
    });
  });

  app.use(hostRoutingMiddleware);

  app.get("/", loadAdminSession, (req: Request, res: Response, next) => {
    if (!isAdminPanelHost(req)) {
      next();
      return;
    }
    const subject = req.adminUser
      ? subjectFromAdmin(req.adminUser, req.userProfile)
      : null;
    if (subject && canAccessAdmin(subject)) {
      res.redirect("/admin");
      return;
    }
    res.redirect("/login");
  });

  app.get("/login", loadClientSession, (req: Request, res: Response, next) => {
    if (isAdminPanelHost(req)) {
      loadAdminSession(req, res, () => {
        redirectIfAuthenticated(req, res, () => {
          void getLoginPage(req, res, next);
        });
      });
      return;
    }

    const subject = req.adminUser
      ? subjectFromAdmin(req.adminUser, req.userProfile)
      : null;
    if (subject && canAccessClient(subject)) {
      const query = req.query as Record<string, string | string[] | undefined>;
      const selectedPlan = parseAgentPlanCode(query.plan);
      if (isAgentPlanIntentQuery(query) && selectedPlan) {
        res.redirect(buildAgentPlanDashboardPath(selectedPlan));
        return;
      }
      const nextPath = parseSafeAppNextPath(query.next);
      if (nextPath) {
        res.redirect(nextPath);
        return;
      }
      res.redirect("/app/dashboard");
      return;
    }

    getClientLoginPage(req, res);
  });

  app.post("/login", (req: Request, res: Response, next) => {
    if (isAdminPanelHost(req)) {
      void postLogin(req, res, next);
      return;
    }
    next();
  });

  app.get("/auth/callback", getAuthCallbackPage);
  app.get("/claim/manual-review", getClaimManualReviewPage);
  app.get("/checkout/success", getCheckoutSuccessPage);

  app.use(landingPublicCors);
  app.use("/api", apiRouter);
  app.use("/admin", adminRouter);
  app.use("/app", appRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
