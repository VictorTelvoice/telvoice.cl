import { Router } from "express";
import { getTestClientHandler } from "../controllers/client.controller.js";

export const clientsRouter = Router();

clientsRouter.get("/test", getTestClientHandler);
