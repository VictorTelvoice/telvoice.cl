/** Scripts inline del navegador para login Supabase (Google + Magic Link) y /auth/callback. */

/** Cliente Supabase compartido (misma URL, key y storage en /login y /auth/callback). */
export function renderSupabaseBrowserClientInit(url: string, key: string): string {
  return `
  import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
  const supabase = createClient(${JSON.stringify(url)}, ${JSON.stringify(key)}, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
      storage: window.localStorage,
    },
  });
  function tvAuthDebug(...args) {
    console.log("[tv-auth]", ...args);
  }
  function tvAuthFail(reason, detail) {
    if (detail) console.error("[tv-auth]", reason, detail);
    else console.error("[tv-auth]", reason);
    const q =
      reason === "exchange_failed" || reason === "oauth_error"
        ? "auth_failed"
        : "google_auth_failed";
    const msg = detail && typeof detail === "string" ? detail : "";
    window.location.href =
      "/login?error=" +
      encodeURIComponent(q) +
      (msg ? "&detail=" + encodeURIComponent(msg.slice(0, 200)) : "");
  }
  function maskUrl(href) {
    try {
      const u = new URL(href);
      if (u.searchParams.has("code")) u.searchParams.set("code", "***");
      return u.toString();
    } catch {
      return href;
    }
  }
  async function tvResolveSessionAfterCallback() {
    const { data: sessionRes, error: sessionError } = await supabase.auth.getSession();
    tvAuthDebug("getSession_error", sessionError?.message || null);
    tvAuthDebug("has_session", Boolean(sessionRes?.session));

    const { data: userRes, error: userError } = await supabase.auth.getUser();
    tvAuthDebug("getUser_error", userError?.message || null);
    tvAuthDebug("getUser_id", userRes?.user?.id || null);

    const session = sessionRes?.session;
    const user = session?.user || userRes?.user;
    return session && user ? session : null;
  }
  async function tvTrySessionFromHash() {
    const raw = (window.location.hash || "").replace(/^#/, "");
    if (!raw || !/access_token|refresh_token/.test(raw)) return null;
    const params = new URLSearchParams(raw);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return null;
    tvAuthDebug("magic_link_hash", true);
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (error) {
      tvAuthDebug("setSession_from_hash_error", error.message);
      return null;
    }
    window.history.replaceState({}, document.title, "/auth/callback");
    return data.session ?? null;
  }
  async function tvRunPostAuth(session) {
    const user = session?.user;
    const accessToken = session?.access_token;
    if (!user || !accessToken) {
      tvAuthFail("no_session_after_exchange");
      return;
    }
    const statusEl = document.getElementById("tv-auth-status");
    function setStatus(t) {
      if (statusEl) statusEl.textContent = t;
    }

    setStatus("Creando cuenta en Telvoice…");
    const payload = {
      supabase_user_id: user.id,
      email: user.email || null,
      name:
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email ||
        "Usuario",
      avatar_url:
        user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
    };
    const boot = await fetch("/api/auth/bootstrap-client", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + accessToken,
      },
      body: JSON.stringify(payload),
    });
    if (!boot.ok) {
      let errBody = "";
      try {
        errBody = await boot.text();
      } catch {}
      tvAuthFail(
        "bootstrap_failed",
        "HTTP " + boot.status + (errBody ? " " + errBody.slice(0, 120) : ""),
      );
      return;
    }

    const claimToken = localStorage.getItem("telvoice_claim_token");
    if (claimToken) {
      setStatus("Activando compra pendiente…");
      const claim = await fetch("/api/public/claim", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer " + accessToken,
        },
        body: JSON.stringify({ claim_token: claimToken }),
      });
      if (claim.ok) {
        localStorage.removeItem("telvoice_claim_token");
      } else {
        try {
          const j = await claim.json();
          if (j && j.status === "manual_review") {
            window.location.href = "/app/dashboard?claim=manual_review";
            return;
          }
        } catch {}
      }
    }

    window.location.href = "/app/dashboard?welcome=1";
  }
  async function tvCompleteAuthCallback() {
    if (window.__tvAuthCallbackRunning) {
      tvAuthDebug("callback_skipped", "already_running");
      return;
    }
    window.__tvAuthCallbackRunning = true;

    const statusEl = document.getElementById("tv-auth-status");
    function setStatus(t) {
      if (statusEl) statusEl.textContent = t;
    }

    const href = window.location.href;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const oauthError = params.get("error");
    const oauthDesc = params.get("error_description");

    tvAuthDebug("callback_url", maskUrl(href));
    tvAuthDebug("has_code", Boolean(code));
    tvAuthDebug("detectSessionInUrl", false);
    tvAuthDebug("oauth_error", oauthError || null);

    if (oauthError) {
      tvAuthFail("oauth_error", oauthDesc || oauthError);
      return;
    }

    setStatus("Obteniendo sesión…");

    let session = null;

    if (code) {
      tvAuthDebug("exchange_start", true);
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      tvAuthDebug("exchange_ok", !exchangeError);

      if (exchangeError) {
        tvAuthDebug("exchange_error", exchangeError.message);
        session = await tvResolveSessionAfterCallback();
        if (session) {
          tvAuthDebug("exchange_failed_but_session_ok", true);
        } else {
          const detail =
            exchangeError.message && /code verifier/i.test(exchangeError.message)
              ? "La sesión de inicio expiró. Vuelve a intentar con Google."
              : exchangeError.message || "No se pudo validar el acceso.";
          tvAuthFail("exchange_failed", detail);
          return;
        }
      } else {
        window.history.replaceState({}, document.title, "/auth/callback");
        session = await tvResolveSessionAfterCallback();
      }
    } else {
      session = await tvTrySessionFromHash();
      if (!session) {
        session = await tvResolveSessionAfterCallback();
      }
    }

    if (!session) {
      tvAuthFail("no_session", "No hay sesión activa. Intenta iniciar sesión de nuevo.");
      return;
    }

    await tvRunPostAuth(session);
  }
`;
}

export function renderLoginBrowserScript(url: string, key: string): string {
  return `<script type="module">
${renderSupabaseBrowserClientInit(url, key)}
  const googleBtn = document.getElementById("tv-google-login");
  if (googleBtn) {
    googleBtn.addEventListener("click", async () => {
      googleBtn.setAttribute("disabled", "disabled");
      try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: \`\${window.location.origin}/auth/callback\`,
            queryParams: {
              prompt: "select_account",
            },
          },
        });
        if (error) {
          window.location.href =
            "/login?error=" + encodeURIComponent(error.message || "google_auth_failed");
        }
      } catch (e) {
        window.location.href =
          "/login?error=" + encodeURIComponent(String(e?.message || e || "google_auth_failed"));
      }
    });
  }

  const emailInput = document.getElementById("tv-email-login");
  const magicBtn = document.getElementById("tv-magic-link-btn");
  const magicStatus = document.getElementById("tv-magic-status");

  function setMagicStatus(html, isError) {
    if (!magicStatus) return;
    magicStatus.innerHTML = html;
    magicStatus.className = "field-hint" + (isError ? " tv-magic-error" : " tv-magic-ok");
  }

  function isValidEmail(value) {
    const v = (value || "").trim();
    if (!v || v.length > 254) return false;
    return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(v);
  }

  if (magicBtn && emailInput) {
    magicBtn.addEventListener("click", async () => {
      const email = emailInput.value.trim();
      if (!isValidEmail(email)) {
        setMagicStatus("Ingresa un correo electrónico válido.", true);
        return;
      }
      magicBtn.setAttribute("disabled", "disabled");
      setMagicStatus("Enviando enlace…", false);
      try {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: \`\${window.location.origin}/auth/callback\`,
            shouldCreateUser: true,
          },
        });
        magicBtn.removeAttribute("disabled");
        if (error) {
          setMagicStatus(escapeHtmlClient(error.message || "No pudimos enviar el enlace."), true);
          return;
        }
        setMagicStatus(
          "Te enviamos un enlace de acceso. Revisa tu correo para entrar a Telvoice.",
          false,
        );
        emailInput.value = "";
      } catch (e) {
        magicBtn.removeAttribute("disabled");
        setMagicStatus(escapeHtmlClient(String(e?.message || e || "Error al enviar el enlace.")), true);
      }
    });
  }

  function escapeHtmlClient(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
</script>`;
}

export function renderAuthCallbackBrowserScript(url: string, key: string): string {
  return `<script type="module">
${renderSupabaseBrowserClientInit(url, key)}
  tvCompleteAuthCallback().catch((e) => {
    tvAuthFail("callback_exception", String(e?.message || e));
  });
</script>`;
}
