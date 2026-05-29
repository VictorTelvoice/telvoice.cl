import { createPublicLead } from "../publicLeadService.js";
import type { CommercialQuoteResult } from "../../types/commercial.js";

export type LeadFields = {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  requested_quantity?: number;
  use_case?: string;
};

export function extractLeadFieldsFromText(text: string): LeadFields {
  const fields: LeadFields = {};
  const t = text.trim();

  const email = t.match(
    /(?:correo|email|e-mail)\s*(?:es|:)?\s*([^\s@]+@[^\s@]+\.[^\s@]+)/i,
  )?.[1] ?? t.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i)?.[1];
  if (email) {
    fields.email = email.toLowerCase();
  }

  const phone =
    t.match(
      /(?:whatsapp|wsp|tel[eé]fono|fono|celular)\s*(?:es|:)?\s*(\+?56\s?9[\d\s]{8,}|9\d{8})/i,
    )?.[1] ?? t.match(/(\+?569[\d\s]{8,}|9\d{8})/)?.[1];
  if (phone) {
    fields.phone = phone.replace(/\s/g, "").replace(/^9/, "+569");
    if (!fields.phone.startsWith("+")) {
      fields.phone = `+56${fields.phone}`;
    }
  }

  const soy = t.match(
    /(?:soy|me llamo)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ\s]{2,40})(?:\s+de\s+|\s*,\s*|\s+en\s+)([A-Za-z0-9ÁÉÍÓÚáéíóúñÑ\s.&-]{2,60})/i,
  );
  if (soy?.[1] && soy[2]) {
    fields.name = soy[1].trim();
    fields.company = soy[2].trim();
  } else {
    const nameOnly = t.match(/(?:soy|me llamo)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ\s]{2,40})/i);
    if (nameOnly?.[1]) {
      fields.name = nameOnly[1].trim();
    }
    const empresa = t.match(
      /(?:empresa|compañ[ií]a|negocio)\s*(?:es|:)?\s*([A-Za-z0-9ÁÉÍÓÚáéíóúñÑ\s.&-]{2,80})/i,
    );
    if (empresa?.[1]) {
      fields.company = empresa[1].trim();
    }
  }

  const qty = t.match(/(\d[\d\s.]*)\s*sms/i);
  if (qty?.[1]) {
    const n = parseInt(qty[1].replace(/[\s.]/g, ""), 10);
    if (Number.isFinite(n) && n > 0) {
      fields.requested_quantity = n;
    }
  }

  const useCase = t.match(
    /(?:para|uso|caso de uso|necesito para)\s+(.{8,120})/i,
  );
  if (useCase?.[1]) {
    fields.use_case = useCase[1].trim().slice(0, 200);
  }

  if (/\botp\b/i.test(t)) {
    fields.use_case = fields.use_case ?? "OTP / verificación";
  }

  return fields;
}

export function mergeLeadFields(
  base: LeadFields,
  patch: LeadFields,
): LeadFields {
  return {
    name: patch.name ?? base.name,
    company: patch.company ?? base.company,
    email: patch.email ?? base.email,
    phone: patch.phone ?? base.phone,
    requested_quantity: patch.requested_quantity ?? base.requested_quantity,
    use_case: patch.use_case ?? base.use_case,
  };
}

export function leadFieldsComplete(fields: LeadFields): boolean {
  const hasContact = Boolean(fields.email?.trim() || fields.phone?.trim());
  const hasIdentity = Boolean(fields.name?.trim() || fields.company?.trim());
  return hasContact && hasIdentity;
}

export function missingLeadFieldPrompt(fields: LeadFields): string {
  const missing: string[] = [];
  if (!fields.name) {
    missing.push("tu nombre");
  }
  if (!fields.company) {
    missing.push("nombre de empresa");
  }
  if (!fields.email && !fields.phone) {
    missing.push("email o WhatsApp");
  }
  if (!fields.requested_quantity) {
    missing.push("cantidad de SMS");
  }
  return missing.join(", ");
}

export async function saveLandingLead(input: {
  fields: LeadFields;
  sessionId: string;
  quote?: CommercialQuoteResult | null;
  lastMessage?: string;
}): Promise<{ ok: boolean; leadId?: string; error?: string }> {
  try {
    const lead = await createPublicLead({
      name: input.fields.name,
      company: input.fields.company,
      email: input.fields.email,
      phone: input.fields.phone,
      requested_quantity: input.fields.requested_quantity,
      message: [
        input.fields.use_case,
        input.lastMessage,
        input.quote
          ? `Cotización: ${input.quote.quoted_quantity} SMS`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 500),
      source: "landing_agent",
      country: "CL",
    });
    return { ok: true, leadId: lead.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo guardar el lead",
    };
  }
}
