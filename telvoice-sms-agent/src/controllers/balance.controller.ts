import type { NextFunction, Request, Response } from "express";
import { fetchAsmscBalance } from "../services/sms.service.js";

export async function balanceHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const provider = await fetchAsmscBalance();
    res.status(200).json({
      success: true,
      provider,
    });
  } catch (error) {
    next(error);
  }
}
