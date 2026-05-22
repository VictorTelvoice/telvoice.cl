import type { NextFunction, Request, Response } from "express";
import { sendTestSms } from "../services/sms.service.js";

export async function sendTestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await sendTestSms(req.body);

    res.status(200).json({
      success: true,
      internal_message_id: result.internal_message_id,
      uid: result.uid,
      provider_message_id: result.provider_message_id,
      provider_status: result.provider_status,
      status: result.status,
      remarks: result.remarks,
      provider_response: result.provider_response,
    });
  } catch (error) {
    next(error);
  }
}
