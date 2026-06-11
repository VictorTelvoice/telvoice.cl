/** Etiquetas MNC Chile (MCC 730) cuando aSMSC incluye MNC en el DLR. */
const CL_MNC_LABELS: Record<string, string> = {
  "1": "Entel",
  "2": "Movistar",
  "3": "Claro",
  "6": "WOM",
};

export function pickAsmscPayloadString(
  record: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | null {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function normalizeMnc(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 3 && digits.startsWith("730")) {
    return digits.slice(3).replace(/^0+/, "") || digits;
  }
  return digits.replace(/^0+/, "") || raw.trim();
}

/** Resuelve operador desde payload DLR / GetDeliveryStatus de aSMSC. */
export function resolveOperatorFromAsmscPayload(
  body: Record<string, unknown> | null | undefined,
): string | null {
  if (!body) {
    return null;
  }

  const operatorName = pickAsmscPayloadString(
    body,
    "OperatorName",
    "operator_name",
    "Operator",
    "operator",
  );
  if (operatorName) {
    return operatorName;
  }

  const mcc = pickAsmscPayloadString(body, "MCC", "mcc") ?? "730";
  const mncRaw = pickAsmscPayloadString(body, "MNC", "mnc", "mccMnc");
  if (!mncRaw) {
    return null;
  }

  const mnc = normalizeMnc(mncRaw);
  if (mcc === "730" || mcc === "CL") {
    const label = CL_MNC_LABELS[mnc];
    if (label) {
      return label;
    }
  }

  return `MNC ${mncRaw} (MCC ${mcc})`;
}

export function resolveOperatorFromPanelMessageMetadata(
  metadata: Record<string, unknown> | null | undefined,
  operator: string | null | undefined,
): string | null {
  if (operator?.trim()) {
    return operator.trim();
  }
  if (!metadata) {
    return null;
  }
  const fromMeta =
    typeof metadata.dlr_operator === "string" ? metadata.dlr_operator : null;
  if (fromMeta?.trim()) {
    return fromMeta.trim();
  }
  const payload = metadata.last_dlr_payload;
  if (payload && typeof payload === "object") {
    return resolveOperatorFromAsmscPayload(payload as Record<string, unknown>);
  }
  return null;
}
