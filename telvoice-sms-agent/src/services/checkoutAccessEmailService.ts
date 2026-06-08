import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

export type PanelAccessLinkResult = {
  panelUrl: string;
  magicLinkSent: boolean;
  magicLinkUrl: string | null;
};

function buildFallbackPanelUrl(email?: string): string {
  const base = `${env.publicAppUrl.replace(/\/$/, "")}/login?next=${encodeURIComponent("/app/numeraciones")}`;
  if (email?.includes("@")) {
    return `${base}&email=${encodeURIComponent(email.trim().toLowerCase())}`;
  }
  return base;
}

export async function resolvePanelAccessLink(
  checkoutEmail: string,
): Promise<PanelAccessLinkResult> {
  const email = checkoutEmail.trim().toLowerCase();
  const redirectTo = `${env.publicAppUrl.replace(/\/$/, "")}/auth/callback?next=${encodeURIComponent("/app/numeraciones")}`;

  const url = env.supabase.url;
  const serviceKey = env.supabase.serviceRoleKey;

  if (!url || !serviceKey) {
    return {
      panelUrl: buildFallbackPanelUrl(email),
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
        panelUrl: buildFallbackPanelUrl(email),
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
      panelUrl: buildFallbackPanelUrl(email),
      magicLinkSent: false,
      magicLinkUrl: null,
    };
  }
}

export function buildPanelLoginUrl(checkoutEmail?: string): string {
  return buildFallbackPanelUrl(checkoutEmail);
}
