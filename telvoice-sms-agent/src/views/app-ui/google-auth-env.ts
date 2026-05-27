import { escapeHtml } from "../../utils/html.js";
import {
  env,
  getGoogleAuthEnvIssues,
  isGoogleAuthConfigured,
  isProduction,
} from "../../config/env.js";

export function googleAuthConfigOrError():
  | { url: string; key: string }
  | { errorHtml: string } {
  if (!isGoogleAuthConfigured()) {
    return { errorHtml: renderGoogleAuthConfigError() };
  }
  return {
    url: env.supabase.publicUrl,
    key: env.supabase.publishableKey,
  };
}

export function renderGoogleAuthConfigError(): string {
  const items = getGoogleAuthEnvIssues()
    .map((issue) => `<li>${escapeHtml(issue.message)}</li>`)
    .join("");

  const opsHint = isProduction()
    ? `<p class="field-hint" style="margin:0.75rem 0 0">Producción: edita <code>/var/www/telvoice-sms-agent/.env</code>, luego <code>npm run build</code> y <code>pm2 restart telvoice-sms-agent --update-env</code>.</p>`
    : `<p class="field-hint" style="margin:0.75rem 0 0">Local: completa <code>telvoice-sms-agent/.env</code> y reinicia <code>npm run dev</code>.</p>`;

  return `
    <div class="alert alert-error">
      <strong>Login con Google no configurado</strong>
      <ul style="margin:0.5rem 0 0;padding-left:1.25rem">${items}</ul>
      ${opsHint}
      <p class="field-hint" style="margin:0.5rem 0 0">Las variables se cargan al arrancar el proceso Node (dotenv), no en un bundle Vite. Tras cambiar <code>.env</code>, reinicia el servicio para aplicarlas.</p>
    </div>`;
}
