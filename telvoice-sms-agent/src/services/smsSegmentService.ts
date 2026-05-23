const GSM_BASIC_CHARS =
  /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\\[~\]|€]*$/;

function hasExtendedGsm(text: string): boolean {
  return /[\^{}\\\[~\]|€]/.test(text);
}

export function isGsm7(text: string): boolean {
  return GSM_BASIC_CHARS.test(text);
}

export function calculateSmsSegments(message: string): {
  characters: number;
  encoding: "GSM-7" | "UCS-2";
  segments: number;
  costSms: number;
} {
  const text = message ?? "";
  const characters = [...text].length;

  if (characters === 0) {
    return { characters: 0, encoding: "GSM-7", segments: 0, costSms: 0 };
  }

  if (isGsm7(text)) {
    const singleLimit = hasExtendedGsm(text) ? 160 : 160;
    if (characters <= singleLimit) {
      return { characters, encoding: "GSM-7", segments: 1, costSms: 1 };
    }
    const multipartLimit = 153;
    const segments = Math.ceil(characters / multipartLimit);
    return { characters, encoding: "GSM-7", segments, costSms: segments };
  }

  const singleLimit = 70;
  if (characters <= singleLimit) {
    return { characters, encoding: "UCS-2", segments: 1, costSms: 1 };
  }
  const multipartLimit = 67;
  const segments = Math.ceil(characters / multipartLimit);
  return { characters, encoding: "UCS-2", segments, costSms: segments };
}

export function validateRecipientNumber(phone: string): {
  ok: boolean;
  normalized?: string;
  error?: string;
} {
  const raw = String(phone ?? "").trim().replace(/\s+/g, "");
  if (!raw) {
    return { ok: false, error: "El número destinatario es obligatorio." };
  }

  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    digits = digits.slice(1);
  }

  if (digits.startsWith("569") && digits.length === 11) {
    return { ok: true, normalized: `+${digits}` };
  }
  if (digits.startsWith("56") && digits.length === 11) {
    return { ok: true, normalized: `+${digits}` };
  }
  if (digits.startsWith("9") && digits.length === 9) {
    return { ok: true, normalized: `+56${digits}` };
  }

  return {
    ok: false,
    error: "Formato inválido. Usa +569XXXXXXXX o 9 dígitos móviles Chile.",
  };
}
