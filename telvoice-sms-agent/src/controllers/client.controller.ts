import type { NextFunction, Request, Response } from "express";
import { getTestClientBundle } from "../services/clientService.js";

export async function getTestClientHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const bundle = await getTestClientBundle();
    res.status(200).json({
      success: true,
      client: bundle.client,
      sms_account: bundle.sms_account,
    });
  } catch (error) {
    next(error);
  }
}
