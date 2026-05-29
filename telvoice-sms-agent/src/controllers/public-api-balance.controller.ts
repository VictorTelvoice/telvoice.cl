import type { Request, Response } from "express";
import { readCompanyBalance } from "../services/smsWalletService.js";
import { getPublicApiRequestId } from "../middleware/public-api-request-context.js";
import { recordPublicApiRequest } from "../middleware/public-api-request-log.js";
import { publicApiError } from "../utils/public-api-response.js";

const DEFAULT_BALANCE_ENDPOINT = "/api/v1/balance";

export async function getPublicApiBalance(
  req: Request,
  res: Response,
): Promise<void> {
  const requestId = getPublicApiRequestId(req);
  const endpoint =
    (req.originalUrl ?? req.path).split("?")[0] || DEFAULT_BALANCE_ENDPOINT;

  try {
    const auth = req.apiKeyAuth;
    if (!auth) {
      recordPublicApiRequest({
        req,
        endpoint,
        method: "GET",
        statusCode: 500,
        success: false,
        errorCode: "INTERNAL_ERROR",
        errorMessage: "An internal error occurred.",
      });
      publicApiError(
        res,
        500,
        requestId,
        "INTERNAL_ERROR",
        "An internal error occurred.",
      );
      return;
    }

    const balance = await readCompanyBalance(auth.companyId);
    const availableSms = balance.availableSms;
    const reservedSms = balance.reservedSms;

    recordPublicApiRequest({
      req,
      endpoint,
      method: "GET",
      statusCode: 200,
      success: true,
      companyId: auth.companyId,
      apiKeyId: auth.apiKeyId,
      environment: auth.environment,
    });

    console.info("[public-api]", {
      endpoint,
      companyId: auth.companyId,
      apiKeyId: auth.apiKeyId,
      status: 200,
      requestId,
    });

    res.json({
      success: true,
      request_id: requestId,
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
    recordPublicApiRequest({
      req,
      endpoint,
      method: "GET",
      statusCode: 500,
      success: false,
      companyId: req.apiKeyAuth?.companyId ?? null,
      apiKeyId: req.apiKeyAuth?.apiKeyId ?? null,
      environment: req.apiKeyAuth?.environment ?? null,
      errorCode: "INTERNAL_ERROR",
      errorMessage: "An internal error occurred.",
    });
    publicApiError(
      res,
      500,
      requestId,
      "INTERNAL_ERROR",
      "An internal error occurred.",
    );
  }
}
