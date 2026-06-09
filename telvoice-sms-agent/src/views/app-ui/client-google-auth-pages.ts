import { isClientPanelAgentLineEnabled } from "../../config/env.js";
import { escapeHtml } from "../../utils/html.js";
import { renderAuthBrand } from "../brand.js";
import { renderClientAuthPage } from "./app-shell.js";
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

  const authScriptOptions = {
    agentLineEnabled: isClientPanelAgentLineEnabled(),
  };
  const authScript =
    "errorHtml" in cfg
      ? ""
      : renderLoginBrowserScript(cfg.url, cfg.key, authScriptOptions);

  const body = `
    <div class="tv-lab-glass-card">
      ${renderAuthBrand("telvoice")}
      <h2 class="tv-page-title" style="margin:0 0 0.35rem;font-size:1.35rem">Panel cliente · SMS masivos</h2>
      <p class="tv-page-sub" style="margin:0 0 1.15rem">Accede o crea tu cuenta para comenzar a enviar SMS.</p>
      ${errorBlock}
      <button type="button" class="btn btn-primary tv-auth-submit tv-lab-btn-primary" id="tv-google-login" ${"errorHtml" in cfg ? "disabled" : ""}>
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
      <div class="tv-lab-auth-divider">
        <span class="tv-lab-auth-divider__line"></span>
        <span class="tv-lab-auth-divider__text">O ingresa con tu correo</span>
        <span class="tv-lab-auth-divider__line"></span>
      </div>
      <label class="field-label" for="tv-email-login">Correo electrónico</label>
      <input type="email" id="tv-email-login" class="input" name="email" autocomplete="email" placeholder="tu@empresa.cl" />
      <button type="button" class="btn btn-ghost tv-auth-submit tv-lab-btn-secondary" id="tv-magic-link-btn" style="margin-top:0.65rem">
        Enviar enlace de acceso
      </button>
      <p id="tv-magic-status" class="field-hint" style="margin:0.65rem 0 0" aria-live="polite"></p>
      <style>
        .tv-magic-ok { color: #047857; }
        .tv-magic-error { color: #b91c1c; }
      </style>`
      }
    </div>
    ${authScript}`;

  return renderClientAuthPage("Login", body);
}

export function renderAuthCallbackPage(): string {
  const cfg = googleAuthConfigOrError();
  const authScriptOptions = {
    agentLineEnabled: isClientPanelAgentLineEnabled(),
  };
  const body = `
    <div class="tv-lab-glass-card">
      ${renderAuthBrand("telvoice", "Conectando…")}
      <p class="tv-page-sub" style="margin:0">Estamos validando tu cuenta. Un momento…</p>
      <p class="field-hint" id="tv-auth-status" style="margin:0.85rem 0 0">Procesando.</p>
    </div>
    ${
      "errorHtml" in cfg
        ? `<script>window.location.replace("/login");</script>`
        : renderAuthCallbackBrowserScript(cfg.url, cfg.key, authScriptOptions)
    }`;

  return renderClientAuthPage("Auth callback", body);
}

export function renderClaimManualReviewPage(): string {
  const body = `
    <div class="tv-lab-glass-card">
      ${renderAuthBrand("telvoice", "Revisión manual")}
      <h2 class="tv-page-title" style="margin:0 0 0.35rem;font-size:1.25rem">Tu pago quedó en revisión</h2>
      <p class="tv-page-sub" style="margin:0 0 1rem">
        Detectamos una diferencia entre el correo autenticado y el correo del pago. No acreditamos automáticamente tu bolsa.
      </p>
      <p class="field-hint" style="margin:0">
        Nuestro equipo revisará el caso. Si necesitas acelerar, escribe a soporte con tu correo y comprobante.
      </p>
      <div style="display:flex;flex-direction:column;gap:0.65rem;margin-top:1.25rem">
        <a class="btn btn-primary tv-lab-btn-primary" href="/app/dashboard">Ir al dashboard</a>
        <a class="btn btn-ghost tv-lab-btn-secondary" href="/login">Volver al login</a>
      </div>
    </div>`;
  return renderClientAuthPage("Revisión manual", body);
}
