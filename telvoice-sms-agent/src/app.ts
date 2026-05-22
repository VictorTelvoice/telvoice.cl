import cookieParser from "cookie-parser";
import express from "express";
import { adminRouter } from "./routes/admin.routes.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.get("/health", (_req, res) => {
    res.json({
      success: true,
      service: "telvoice-sms-agent",
      status: "ok",
    });
  });

  app.use("/api", apiRouter);
  app.use("/admin", adminRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
