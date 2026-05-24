import type { ResolvedSmsRoute } from "../types/sms-routing.js";
import { AppError } from "../utils/errors.js";
import { getCompanyRatePlan } from "./companyRatePlanService.js";
import { getSmsProviderById } from "./smsProviderService.js";
import { findDefaultRouteForCountry, getSmsRouteById } from "./smsRouteService.js";
import { getSmsRatePlanById, listRatePlanDetails } from "./smsRatePlanService.js";

export async function resolveRouteForMessage(input: {
  companyId: string;
  country?: string;
  phone?: string;
  trafficType?: string;
}): Promise<ResolvedSmsRoute> {
  const country = input.country ?? "CL";
  const trafficType = input.trafficType ?? "transactional";

  const assignment = await getCompanyRatePlan(
    input.companyId,
    country,
    trafficType,
  );

  if (!assignment?.rate_plan_id) {
    throw new AppError(
      "Cliente sin rate plan asignado para envío real. Asigne un plan en Superadmin.",
      400,
    );
  }

  const ratePlan = await getSmsRatePlanById(assignment.rate_plan_id);
  if (!ratePlan || ratePlan.status !== "active") {
    throw new AppError("El rate plan asignado no está activo.", 400);
  }

  const details = await listRatePlanDetails(ratePlan.id);
  const activeDetails = details.filter((d) => d.status === "active");

  let detail =
    activeDetails.find((d) => d.route?.is_default && d.country === country) ??
    activeDetails.find((d) => d.country === country) ??
    activeDetails[0];

  if (!detail?.route_id) {
    const fallbackRoute = await findDefaultRouteForCountry(country);
    if (!fallbackRoute) {
      throw new AppError(
        "No hay ruta SMS activa para este cliente/destino.",
        400,
      );
    }
    const provider = await getSmsProviderById(fallbackRoute.provider_id);
    if (!provider || provider.status !== "active") {
      throw new AppError("El proveedor de la ruta default no está activo.", 400);
    }
    return {
      provider,
      route: fallbackRoute,
      ratePlan,
      ratePlanDetail: {
        id: "",
        rate_plan_id: ratePlan.id,
        route_id: fallbackRoute.id,
        country,
        mcc: fallbackRoute.mcc,
        mnc: fallbackRoute.mnc,
        operator_name: fallbackRoute.operator_name,
        traffic_type: trafficType,
        sell_price_per_sms: 1,
        cost_price_per_sms: Number(fallbackRoute.cost_per_sms) || 0,
        currency: ratePlan.currency,
        margin: 1 - (Number(fallbackRoute.cost_per_sms) || 0),
        status: "active",
        metadata: {},
        created_at: "",
        updated_at: "",
      },
      sellPricePerSms: 1,
      costPricePerSms: Number(fallbackRoute.cost_per_sms) || 0,
      margin: 1 - (Number(fallbackRoute.cost_per_sms) || 0),
      currency: ratePlan.currency,
    };
  }

  const route = await getSmsRouteById(detail.route_id);
  if (!route || route.status !== "active") {
    throw new AppError("La ruta SMS del rate plan no está activa.", 400);
  }

  const provider = await getSmsProviderById(route.provider_id);
  if (!provider || provider.status !== "active") {
    throw new AppError("El proveedor SMS no está activo.", 400);
  }

  const sell = Number(detail.sell_price_per_sms) || 1;
  const cost = Number(detail.cost_price_per_sms) || Number(route.cost_per_sms) || 0;

  return {
    provider,
    route,
    ratePlan,
    ratePlanDetail: detail,
    sellPricePerSms: sell,
    costPricePerSms: cost,
    margin: sell - cost,
    currency: detail.currency ?? ratePlan.currency,
  };
}
