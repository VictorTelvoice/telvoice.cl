import { escapeHtml } from "../../utils/html.js";
import { renderAuthBrand } from "../brand.js";
import { renderLayout } from "../admin-ui/shell.js";
import { googleAuthConfigOrError } from "./google-auth-env.js";
import {
  renderAuthCallbackBrowserScript,
  renderLoginBrowserScript,
} from "./client-auth-scripts.js";

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  google_auth_failed:
    "No pudimos completar el inicio de sesión. Intenta de nuevo con Google o solicita un enlace por correo.",
  auth_failed:
    "No pudimos validar tu acceso. El enlace puede haber expirado; solicita uno nuevo.",
  missing_bearer_token: "Sesión no válida. Vuelve a iniciar sesión.",
};

function formatLoginError(error?: string, detail?: string): string {
  const code = (error ?? "").trim();
  if (!code) return "";
  const base =
    LOGIN_ERROR_MESSAGES[code] ??
    decodeURIComponent(code).replace(/_/g, " ");
  const extra = (detail ?? "").trim();
  if (extra && extra !== code) {
    return `${base} (${decodeURIComponent(extra).slice(0, 180)})`;
  }
  return base;
}

export function renderClientLoginPage(options?: {
  error?: string;
  detail?: string;
}): string {
  const cfg = googleAuthConfigOrError();
  const configErrorBlock = "errorHtml" in cfg ? cfg.errorHtml : "";
  const userError = formatLoginError(options?.error, options?.detail);
  const errorBlock =
    configErrorBlock ||
    (userError
      ? `<div class="alert alert-error">${escapeHtml(userError)}</div>`
      : "");

  const authScript =
    "errorHtml" in cfg
      ? ""
      : renderLoginBrowserScript(cfg.url, cfg.key);

  const body = `
    <div class="tv-auth-card" style="max-width:520px">
      ${renderAuthBrand("telvoice", "Panel cliente")}
      <h2 class="tv-page-title" style="margin:0 0 0.35rem">Entra a Telvoice</h2>
      <p class="tv-page-sub" style="margin:0 0 1rem">Accede o crea tu cuenta para comenzar a enviar SMS.</p>
      ${errorBlock}
      <button type="button" class="btn btn-primary tv-auth-submit" id="tv-google-login" ${"errorHtml" in cfg ? "disabled" : ""}>
        <span class="material-symbols-outlined" aria-hidden="true" style="font-size:1.1rem">login</span>
        Continuar con Google
      </button>
      <p class="field-hint" style="margin:0.85rem 0 0">
        Opción recomendada. Usamos Supabase Auth (Google OAuth).
      </p>
      ${
        "errorHtml" in cfg
          ? ""
          : `
      <div class="tv-auth-divider" style="margin:1.25rem 0;display:flex;align-items:center;gap:0.75rem">
        <span style="flex:1;height:1px;background:var(--tv-border)"></span>
        <span class="field-hint" style="margin:0">O ingresa con tu correo</span>
        <span style="flex:1;height:1px;background:var(--tv-border)"></span>
      </div>
      <label class="field-label" for="tv-email-login">Correo electrónico</label>
      <input type="email" id="tv-email-login" class="input" name="email" autocomplete="email" placeholder="tu@empresa.cl" />
      <button type="button" class="btn btn-ghost tv-auth-submit" id="tv-magic-link-btn" style="margin-top:0.65rem;width:100%">
        Enviar enlace de acceso
      </button>
      <p id="tv-magic-status" class="field-hint" style="margin:0.65rem 0 0" aria-live="polite"></p>
      <style>
        .tv-magic-ok { color: var(--tv-ok); }
        .tv-magic-error { color: var(--tv-err); }
      </style>`
      }
    </div>
    ${authScript}`;

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
      "errorHtml" in cfg
        ? `<script>window.location.replace("/login");</script>`
        : renderAuthCallbackBrowserScript(cfg.url, cfg.key)
    }`;

  return renderLayout({ title: "Auth callback", body, showNav: false });
}

export function renderClaimManualReviewPage(): string {
  const body = `
    <div class="tv-auth-card" style="max-width:520px">
      ${renderAuthBrand("telvoice", "Revisión manual")}
      <h2 class="tv-page-title" style="margin:0 0 0.35rem">Tu pago quedó en revisión</h2>
      <p class="tv-page-sub" style="margin:0 0 1rem">
        Detectamos una diferencia entre el correo autenticado y el correo del pago. No acreditamos automáticamente tu bolsa.
      </p>
      <p class="field-hint" style="margin:0">
        Nuestro equipo revisará el caso. Si necesitas acelerar, escribe a soporte con tu correo y comprobante.
      </p>
      <div class="tv-quick-actions" style="margin-top:1rem">
        <a class="btn btn-primary" href="/app/dashboard">Ir al dashboard</a>
        <a class="btn btn-ghost" href="/login">Volver al login</a>
      </div>
    </div>`;
  return renderLayout({ title: "Revisión manual", body, showNav: false });
}
