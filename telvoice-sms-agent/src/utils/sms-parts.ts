const GSM_SINGLE_PART = 160;
const UNICODE_SINGLE_PART = 70;

export function estimateSmsParts(text: string, encoding: string): number {
  const length = text.length;
  if (length === 0) {
    return 1;
  }

  const charsPerPart =
    encoding.toUpperCase() === "U" ? UNICODE_SINGLE_PART : GSM_SINGLE_PART;

  return Math.max(1, Math.ceil(length / charsPerPart));
}
