import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

export type PanelAccessLinkResult = {
  panelUrl: string;
  magicLinkSent: boolean;
  magicLinkUrl: string | null;
};

/** Destino tras login/magic link en compras landing SMS (no SIM). */
export const CHECKOUT_SMS_PANEL_LOGIN_NEXT = "/app/dashboard?welcome=1";

function buildFallbackPanelUrl(email?: string, nextPath = CHECKOUT_SMS_PANEL_LOGIN_NEXT): string {
  const base = `${env.publicAppUrl.replace(/\/$/, "")}/login?next=${encodeURIComponent(nextPath)}`;
  if (email?.includes("@")) {
    return `${base}&email=${encodeURIComponent(email.trim().toLowerCase())}`;
  }
  return base;
}

export async function resolvePanelAccessLink(
  checkoutEmail: string,
  options?: { nextPath?: string },
): Promise<PanelAccessLinkResult> {
  const email = checkoutEmail.trim().toLowerCase();
  const nextPath = options?.nextPath ?? CHECKOUT_SMS_PANEL_LOGIN_NEXT;
  const redirectTo = `${env.publicAppUrl.replace(/\/$/, "")}/auth/callback?next=${encodeURIComponent(nextPath)}`;

  const url = env.supabase.url;
  const serviceKey = env.supabase.serviceRoleKey;

  if (!url || !serviceKey) {
    return {
      panelUrl: buildFallbackPanelUrl(email, nextPath),
      magicLinkSent: false,
      magicLinkUrl: null,
    };
  }

  try {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });

    if (error || !data?.properties?.action_link) {
      console.warn("[checkout-access] magic link unavailable", error?.message);
      return {
        panelUrl: buildFallbackPanelUrl(email, nextPath),
        magicLinkSent: false,
        magicLinkUrl: null,
      };
    }

    return {
      panelUrl: data.properties.action_link,
      magicLinkSent: true,
      magicLinkUrl: data.properties.action_link,
    };
  } catch (err) {
    console.warn("[checkout-access] magic link failed", err);
    return {
      panelUrl: buildFallbackPanelUrl(email, nextPath),
      magicLinkSent: false,
      magicLinkUrl: null,
    };
  }
}

export function buildPanelLoginUrl(checkoutEmail?: string): string {
  return buildFallbackPanelUrl(checkoutEmail);
}
