import { Router } from "express";
import { getPublicApiBalance } from "../controllers/public-api-balance.controller.js";
import { requireApiKeyScope } from "../middleware/api-key-auth.js";
import { publicApiRequestContext } from "../middleware/public-api-request-context.js";

export const v1Router = Router();

v1Router.use(publicApiRequestContext);

// Fase 2: solo balance. Envío SMS y mensajes en fases posteriores.
v1Router.get("/balance", requireApiKeyScope("balance:read"), getPublicApiBalance);
