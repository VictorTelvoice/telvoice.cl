import { Router } from "express";
import { postWebAgentChat } from "../controllers/web-agent.controller.js";

export const webAgentRouter = Router();

/** Agente comercial landing — público, sin datos privados. */
webAgentRouter.post("/chat", postWebAgentChat);
