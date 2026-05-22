import { Router } from "express";
import { balanceHandler } from "../controllers/balance.controller.js";

export const balanceRouter = Router();

balanceRouter.get("/balance", balanceHandler);
