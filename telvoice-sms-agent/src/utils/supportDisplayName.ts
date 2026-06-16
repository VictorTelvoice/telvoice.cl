/** Nombre visible en respuestas públicas de soporte (panel cliente y emails). */
export const SUPPORT_PUBLIC_DISPLAY_NAME = "Equipo Telvoice";

export function resolveSupportReplyDisplayName(_authorName?: string | null): string {
  return SUPPORT_PUBLIC_DISPLAY_NAME;
}
