import { escapeHtml } from "../../utils/html.js";
import { renderAuthBrand } from "../brand.js";
import { renderLayout } from "../admin-ui/shell.js";
import { env } from "../../config/env.js";

function googleAuthConfigOrError(): { url: string; key: string } | { error: string } {
  const url = env.supabase.publicUrl;
  const key = env.supabase.publishableKey;
  if (!url || !key) {
    return {
      error:
        "Login Google no configurado. Falta VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY.",
    };
  }
  return { url, key };
}

export function renderClientLoginPage(options?: { error?: string }): string {
  const cfg = googleAuthConfigOrError();
  const error =
    options?.error ||
    ("error" in cfg ? cfg.error : "");

  const errorBlock = error
    ? `<div class="alert alert-error">${escapeHtml(error)}</div>`
    : "";

  const body = `
    <div class="tv-auth-card" style="max-width:520px">
      ${renderAuthBrand("telvoice", "Panel cliente")}
      <h2 class="tv-page-title" style="margin:0 0 0.35rem">Entra a Telvoice</h2>
      <p class="tv-page-sub" style="margin:0 0 1rem">Accede o crea tu cuenta con Google para comenzar a enviar SMS.</p>
      ${errorBlock}
      <button type="button" class="btn btn-primary tv-auth-submit" id="tv-google-login" ${"error" in cfg ? "disabled" : ""}>
        <span class="material-symbols-outlined" aria-hidden="true" style="font-size:1.1rem">login</span>
        Continuar con Google
      </button>
      <p class="field-hint" style="margin:0.85rem 0 0">
        Sin contraseñas. Usamos Supabase Auth (Google OAuth).
      </p>
    </div>
    ${
      "error" in cfg
        ? ""
        : `<script type="module">
  import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
  const supabase = createClient(${JSON.stringify(cfg.url)}, ${JSON.stringify(cfg.key)});
  const btn = document.getElementById("tv-google-login");
  if (btn) btn.addEventListener("click", async () => {
    btn.setAttribute("disabled","disabled");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: \`\${window.location.origin}/auth/callback\`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) {
        window.location.href = "/login?error=" + encodeURIComponent(error.message || "google_auth_failed");
      }
    } catch (e) {
      window.location.href = "/login?error=" + encodeURIComponent(String(e?.message || e || "google_auth_failed"));
    }
  });
</script>`
    }`;

  return renderLayout({ title: "Login", body, showNav: false });
}

export function renderAuthCallbackPage(): string {
  const cfg = googleAuthConfigOrError();
  const body = `
    <div class="tv-auth-card" style="max-width:520px">
      ${renderAuthBrand("telvoice", "Conectando…")}
      <p class="tv-page-sub" style="margin:0">Estamos validando tu cuenta. Un momento…</p>
      <p class="field-hint" id="tv-auth-status" style="margin:0.85rem 0 0">Procesando.</p>
    </div>
    ${
      "error" in cfg
        ? `<script>window.location.href='/login?error='+encodeURIComponent(${JSON.stringify(cfg.error)});</script>`
        : `<script type="module">
  import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
  const statusEl = document.getElementById("tv-auth-status");
  function setStatus(t){ if(statusEl) statusEl.textContent = t; }
  const supabase = createClient(${JSON.stringify(cfg.url)}, ${JSON.stringify(cfg.key)});

  async function main(){
    setStatus("Obteniendo sesión…");
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) {
      window.location.href = "/login?error=google_auth_failed";
      return;
    }

    const accessToken = (await supabase.auth.getSession()).data?.session?.access_token;
    setStatus("Creando cuenta en Telvoice…");
    const payload = {
      supabase_user_id: user.id,
      email: user.email || null,
      name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || "Usuario",
      avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
    };
    const boot = await fetch("/api/auth/bootstrap-client", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(accessToken ? { "authorization": "Bearer " + accessToken } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!boot.ok) {
      window.location.href = "/login?error=google_auth_failed";
      return;
    }

    const token = localStorage.getItem("telvoice_claim_token");
    if (token) {
      setStatus("Activando compra pendiente…");
      const claim = await fetch("/api/public/claim", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(accessToken ? { "authorization": "Bearer " + accessToken } : {}),
        },
        body: JSON.stringify({ claim_token: token, supabase_user_id: user.id }),
      });
      if (claim.ok) {
        localStorage.removeItem("telvoice_claim_token");
      }
    }

    window.location.href = "/app/dashboard?welcome=1";
  }

  main().catch(() => {
    window.location.href = "/login?error=google_auth_failed";
  });
</script>`
    }`;

  return renderLayout({ title: "Auth callback", body, showNav: false });
}

