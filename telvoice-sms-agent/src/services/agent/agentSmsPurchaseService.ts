import { randomUUID } from "node:crypto";
import { isMercadoPagoConfigured } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";
import { CLIENT_PANEL_ORDER_METADATA } from "../../utils/order-display.js";
import type { CommercialQuoteResult } from "../../types/commercial.js";
import { resolveSmsPackageForCalculatorQuantity } from "../clientPanelBagCheckoutService.js";
import {
  startClientPanelMercadoPagoCheckout,
  resolveMercadoPagoInitPoint,
} from "../mercadoPagoClientPanelService.js";
import {
  getOrderForCompany,
  getOrderById,
  patchOrderFields,
} from "../smsOrderService.js";
import {
  calculateTelvoiceQuote,
  isManualQuoteRequired,
} from "../telvoicePricingService.js";
import type { AgentExecutionContext } from "./types.js";

export type AgentSmsPurchaseResult = {
  orderId: string;
  checkoutUrl: string;
  quote: CommercialQuoteResult;
  reusedExistingOrder: boolean;
};

function agentOrderMetadata(input: {
  sessionId: string;
  userId: string | null;
  quantity: number;
  blockedSend?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    ...CLIENT_PANEL_ORDER_METADATA,
    source: "agent_panel",
    checkout_mode: "mercadopago",
    agent_session_id: input.sessionId,
    agent_user_id: input.userId,
    agent_sms_quantity: input.quantity,
    ...(input.blockedSend ? { agent_blocked_send: input.blockedSend } : {}),
  };
}

async function loadReusableAgentOrder(input: {
  companyId: string;
  orderId: string;
  expectedQuantity: number;
}): Promise<AgentSmsPurchaseResult | null> {
  const order = await getOrderForCompany(input.orderId, input.companyId);
  if (!order) {
    return null;
  }
  if (order.payment_status !== "pending" && order.credit_status !== "pending") {
    return null;
  }
  const meta = order.metadata ?? {};
  const qty = Number(meta.agent_sms_quantity ?? 0);
  if (qty !== input.expectedQuantity) {
    return null;
  }
  const checkoutUrl = resolveMercadoPagoInitPoint(order);
  if (!checkoutUrl) {
    return null;
  }
  const quote = await calculateTelvoiceQuote(input.expectedQuantity);
  return {
    orderId: order.id,
    checkoutUrl,
    quote,
    reusedExistingOrder: true,
  };
}

/**
 * Crea orden panel + preferencia MercadoPago para compra desde el agente.
 * Reutiliza orden pendiente de la misma sesión/cantidad cuando existe.
 */
export async function createSmsPurchaseOrderForCompany(input: {
  ctx: AgentExecutionContext;
  quantity: number;
  existingOrderId?: string | null;
  blockedSend?: Record<string, unknown>;
  payerEmail?: string | null;
}): Promise<AgentSmsPurchaseResult> {
  if (isManualQuoteRequired(input.quantity)) {
    throw new AppError(
      "Para esta cantidad necesitas cotización comercial. Un ejecutivo Telvoice te contactará.",
      400,
    );
  }

  if (!isMercadoPagoConfigured()) {
    throw new AppError(
      "El pago con MercadoPago no está disponible en este momento. Puedes comprar en Comprar SMS del panel.",
      503,
    );
  }

  const quote = await calculateTelvoiceQuote(input.quantity);

  if (input.existingOrderId) {
    const reused = await loadReusableAgentOrder({
      companyId: input.ctx.companyId,
      orderId: input.existingOrderId,
      expectedQuantity: quote.quoted_quantity,
    });
    if (reused) {
      return reused;
    }
  }

  const { packageId } = await resolveSmsPackageForCalculatorQuantity(
    quote.requested_quantity,
    quote.country_code,
  );

  const idempotencyKey = randomUUID();
  const checkout = await startClientPanelMercadoPagoCheckout({
    companyId: input.ctx.companyId,
    packageId,
    createdBy: input.ctx.userId,
    payer: {
      email:
        input.payerEmail?.trim() ||
        `compras+${input.ctx.companyId.slice(0, 8)}@cliente.telvoice.cl`,
      name: "Cliente Telvoice",
    },
  });

  const order = await getOrderById(checkout.orderId);
  if (order) {
    await patchOrderFields(order.id, {
      metadata: {
        ...(order.metadata ?? {}),
        ...agentOrderMetadata({
          sessionId: input.ctx.sessionId,
          userId: input.ctx.userId,
          quantity: quote.quoted_quantity,
          blockedSend: input.blockedSend,
        }),
        agent_idempotency_key: idempotencyKey,
      },
    });
  }

  return {
    orderId: checkout.orderId,
    checkoutUrl: checkout.checkoutUrl,
    quote,
    reusedExistingOrder: false,
  };
}

export function formatPaymentLinkLine(checkoutUrl: string): string {
  return `Puedes pagar aquí:\n${checkoutUrl}`;
}
