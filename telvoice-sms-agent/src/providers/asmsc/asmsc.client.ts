import axios, { type AxiosInstance, isAxiosError } from "axios";
import { env } from "../../config/env.js";
import type {
  AsmscApiResponse,
  CheckBalancePayload,
  GetDeliveryStatusPayload,
  SendSmsPayload,
  SendSmsRequest,
} from "../../types/asmsc.js";
import { AsmscApiError } from "../../utils/errors.js";

export class AsmscClient {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: env.asmsc.baseUrl,
      timeout: 30_000,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
  }

  async sendSms(request: SendSmsRequest): Promise<AsmscApiResponse> {
    const payload = this.buildSendSmsPayload(request);
    return this.post<AsmscApiResponse>("/SendSMS", payload);
  }

  async getDeliveryStatus(
    params: Pick<GetDeliveryStatusPayload, "message_id" | "uid" | "SMSID">,
  ): Promise<AsmscApiResponse> {
    const payload: GetDeliveryStatusPayload = {
      api_id: env.asmsc.apiId,
      api_password: env.asmsc.apiPassword,
      ...params,
    };
    return this.post<AsmscApiResponse>("/GetDeliveryStatus", payload);
  }

  async checkBalance(): Promise<AsmscApiResponse> {
    const payload: CheckBalancePayload = {
      api_id: env.asmsc.apiId,
      api_password: env.asmsc.apiPassword,
    };
    return this.post<AsmscApiResponse>("/CheckBalance", payload);
  }

  private buildSendSmsPayload(request: SendSmsRequest): SendSmsPayload {
    const senderId =
      request.sender_id?.trim() || env.asmsc.defaultSenderId || "";

    return {
      api_id: env.asmsc.apiId,
      api_password: env.asmsc.apiPassword,
      sms_type: request.sms_type ?? env.asmsc.defaultSmsType,
      encoding: request.encoding ?? "T",
      sender_id: senderId,
      phonenumber: request.phonenumber,
      templateid: request.templateid ?? request.template_id ?? "",
      textmessage: request.textmessage,
      V1: request.V1 ?? "",
      V2: request.V2 ?? "",
      V3: request.V3 ?? "",
      V4: request.V4 ?? "",
      V5: request.V5 ?? "",
      ValidityPeriodInSeconds: request.ValidityPeriodInSeconds,
      uid: request.uid ?? "",
      callback_url: request.callback_url ?? "",
      pe_id: request.pe_id ?? "",
      template_id: request.template_id ?? request.templateid ?? "",
    };
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    try {
      const response = await this.http.post<T>(path, body);
      return response.data;
    } catch (error) {
      throw this.mapAxiosError(error, path);
    }
  }

  private mapAxiosError(error: unknown, path: string): AsmscApiError {
    if (isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;
      const message =
        typeof data === "object" && data !== null && "message" in data
          ? String((data as Record<string, unknown>).message)
          : error.message;

      return new AsmscApiError(
        `Error al llamar aSMSC ${path}: ${message}`,
        data ?? { status, message: error.message },
        status && status >= 400 && status < 500 ? status : 502,
      );
    }

    return new AsmscApiError(
      `Error inesperado al llamar aSMSC ${path}`,
      error,
    );
  }
}

export const asmscClient = new AsmscClient();
