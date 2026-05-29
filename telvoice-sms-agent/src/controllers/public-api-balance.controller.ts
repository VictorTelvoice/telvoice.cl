import type { Request, Response } from "express";
import { readCompanyBalance } from "../services/smsWalletService.js";

export async function getPublicApiBalance(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const auth = req.apiKeyAuth;
    if (!auth) {
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred.",
        },
      });
      return;
    }

    const balance = await readCompanyBalance(auth.companyId);
    const availableSms = balance.availableSms;
    const reservedSms = balance.reservedSms;

    res.json({
      success: true,
      company_id: auth.companyId,
      balance: {
        available_sms: availableSms,
        reserved_sms: reservedSms,
        total_sms: availableSms + reservedSms,
      },
      environment: auth.environment,
      currency: "SMS",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("[public-api] GET /api/v1/balance", error);
    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal error occurred.",
      },
    });
  }
}
