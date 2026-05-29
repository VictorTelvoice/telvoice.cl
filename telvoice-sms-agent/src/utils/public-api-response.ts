import type { Response } from "express";

export function publicApiError(
  res: Response,
  statusCode: number,
  requestId: string,
  code: string,
  message: string,
): void {
  res.status(statusCode).json({
    success: false,
    request_id: requestId,
    error: { code, message },
  });
}
