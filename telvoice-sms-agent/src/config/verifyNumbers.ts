import { validateRecipientNumber } from "../services/smsSegmentService.js";

export type VerifyNumberEntry = {
  id: string;
  phone: string;
  label: string;
  operator: string;
  channel: "telsim" | "manual";
  /** ID slot SIM en telsim.io (4º segmento en TELVOICE_VERIFY_NUMBERS). */
  slotId: string | null;
};

function stableVerifyId(normalizedPhone: string): string {
  const digits = normalizedDigits(normalizedPhone);
  return digits ? `cl-${digits}` : "verify";
}

/** @deprecated Solo compatibilidad con slugs antiguos basados en etiqueta. */
function legacySlugId(label: string, phone: string): string {
  const base = `${label}-${phone}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return base.slice(0, 48) || "verify";
}

/** Formato env: +569xxx:Etiqueta:Operador:slot_id|... (operador y slot_id opcionales) */
export function parseVerifyNumbersFromEnv(raw: string): VerifyNumberEntry[] {
  if (!raw.trim()) {
    return [];
  }

  const entries: VerifyNumberEntry[] = [];
  const parts = raw.split("|").map((p) => p.trim()).filter(Boolean);

  for (const part of parts) {
    const segments = part.split(":").map((s) => s.trim());
    const phoneRaw = segments[0];
    if (!phoneRaw) {
      continue;
    }
    const validated = validateRecipientNumber(phoneRaw);
    if (!validated.ok || !validated.normalized) {
      continue;
    }
    const label = segments[1] || "Verificación telsim";
    const operator = segments[2] || "—";
    const slotId = segments[3]?.trim() || null;
    const channel =
      label.toLowerCase().includes("telsim") || operator.toLowerCase().includes("telsim")
        ? "telsim"
        : "manual";

    entries.push({
      id: stableVerifyId(validated.normalized),
      phone: validated.normalized,
      label,
      operator,
      channel,
      slotId,
    });
  }

  return entries;
}

export function getRegisteredVerifyNumbers(): VerifyNumberEntry[] {
  const raw = process.env.TELVOICE_VERIFY_NUMBERS ?? "";
  return parseVerifyNumbersFromEnv(raw);
}

export function isRegisteredVerifyNumber(normalizedPhone: string): boolean {
  const digits = normalizedPhone.replace(/[^\d+]/g, "");
  return getRegisteredVerifyNumbers().some((entry) => {
    const a = entry.phone.replace(/[^\d+]/g, "");
    return a === digits || a === digits.replace(/^\+/, "");
  });
}

export function findVerifyNumberById(id: string): VerifyNumberEntry | null {
  const trimmed = id.trim();
  if (!trimmed) {
    return null;
  }
  const entries = getRegisteredVerifyNumbers();
  const direct = entries.find((e) => e.id === trimmed);
  if (direct) {
    return direct;
  }
  if (trimmed.startsWith("cl-")) {
    const digits = trimmed.slice(3);
    return entries.find((e) => normalizedDigits(e.phone) === digits) ?? null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 10) {
    const tail = digits.slice(-11);
    return entries.find((e) => normalizedDigits(e.phone) === tail) ?? null;
  }
  return (
    entries.find((e) => legacySlugId(e.label, e.phone) === trimmed) ?? null
  );
}

export function findVerifyNumberByIndex(index: number): VerifyNumberEntry | null {
  if (!Number.isFinite(index) || index < 0) {
    return null;
  }
  return getRegisteredVerifyNumbers()[Math.floor(index)] ?? null;
}

export function findVerifyNumberBySlotId(slotId: string): VerifyNumberEntry | null {
  const id = slotId.trim();
  if (!id) {
    return null;
  }
  return getRegisteredVerifyNumbers().find((e) => e.slotId === id) ?? null;
}

function normalizedDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Operador por defecto si el env trae «—» (líneas QA Telvoice). */
const DEFAULT_OPERATOR_BY_DIGITS: Record<string, string> = {
  "56934449937": "Entel",
  "56974713166": "Movistar",
  "56977109623": "Movistar",
};

export function resolveVerifyOperatorName(entry: VerifyNumberEntry): string {
  const fromEnv = entry.operator.trim();
  if (fromEnv && fromEnv !== "—" && fromEnv !== "-") {
    return fromEnv;
  }
  return DEFAULT_OPERATOR_BY_DIGITS[normalizedDigits(entry.phone)] ?? "Chile";
}

/** Etiqueta legible: «Chile Entel 56934449937», «Chile Movistar 569…». */
export function formatVerifyLineDisplay(entry: VerifyNumberEntry): string {
  const operator = resolveVerifyOperatorName(entry);
  const phone = normalizedDigits(entry.phone);
  if (operator === "Chile") {
    return `Chile ${phone}`;
  }
  return `Chile ${operator} ${phone}`;
}

export function maskVerifyPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) {
    return "+****";
  }
  const tail = digits.slice(-4);
  if (digits.startsWith("569")) {
    return `+569****${tail}`;
  }
  return `+${digits.slice(0, 2)}****${tail}`;
}
