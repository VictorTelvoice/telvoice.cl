/** Modo panel para envíos comerciales reales (aSMSC). */
export const PANEL_PRODUCTION_MODE = "live" as const;

export const PANEL_LIVE_MODES = ["live", "live_test"] as const;

export type PanelLiveMode = (typeof PANEL_LIVE_MODES)[number];

/** Fuente metadata panel cliente — envío comercial real. */
export const APP_CLIENT_LIVE_SOURCE = "app_send_sms_live";

export function isPanelLiveMode(mode: string | null | undefined): boolean {
  return mode === "live" || mode === "live_test";
}

export function isPanelMockMode(mode: string | null | undefined): boolean {
  return mode === "mock";
}
