import cookieParser from "cookie-parser";
import express, { type Request } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adminRouter } from "./routes/admin.routes.js";
import { appRouter } from "./routes/app.routes.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import type { RequestWithRawBody } from "./types/express-request.js";
import {
  getAuthCallbackPage,
  getClaimManualReviewPage,
  getClientLoginPage,
} from "./controllers/client-google-auth.controller.js";

const publicDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
);

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
    res.json({
      success: true,
      service: "telvoice-sms-agent",
      status: "ok",
    });
  });

  app.get("/login", getClientLoginPage);
  app.get("/auth/callback", getAuthCallbackPage);
  app.get("/claim/manual-review", getClaimManualReviewPage);

  app.use("/api", apiRouter);
  app.use("/admin", adminRouter);
  app.use("/app", appRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
