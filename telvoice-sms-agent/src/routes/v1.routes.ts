import { Router } from "express";
import { getPublicApiBalance } from "../controllers/public-api-balance.controller.js";
import { requireApiKeyScope } from "../middleware/api-key-auth.js";

export const v1Router = Router();

// Fase 2: solo balance. Envío SMS y mensajes en fases posteriores.
v1Router.get("/balance", requireApiKeyScope("balance:read"), getPublicApiBalance);
