import { escapeHtml } from "../../utils/html.js";
import { renderAuthBrand } from "../brand.js";
import { renderLayout } from "./shell.js";

export function renderAuthLoginPage(options: {
  error?: string;
  next?: string;
  signupAvailable?: boolean;
  successMessage?: string;
}): string {
  const errorBlock = options.error
    ? `<div class="alert alert-error">${escapeHtml(options.error)}</div>`
    : "";
  const successBlock = options.successMessage
    ? `<div class="alert alert-success">${escapeHtml(options.successMessage)}</div>`
    : "";

  const signupBlock = options.signupAvailable
    ? `<p class="tv-auth-foot">
        ¿Primera vez? <a href="/admin/register">Crear cuenta con Gmail</a>
      </p>`
    : "";

  const body = `
    <div class="tv-auth-card">
      ${renderAuthBrand("telvoice", "Panel administrativo · agent.telvoice.cl")}
      ${successBlock}
      ${errorBlock}
      <form method="post" action="/admin/login" class="tv-auth-form">
        <input type="hidden" name="next" value="${escapeHtml(options.next ?? "/admin")}" />
        <div class="form-group">
          <label for="email">Correo</label>
          <input id="email" name="email" type="email" required autocomplete="username" placeholder="tu@gmail.com" />
        </div>
        <div class="form-group">
          <label for="password">Contraseña</label>
          <input id="password" name="password" type="password" required autocomplete="current-password" />
        </div>
        <button type="submit" class="btn btn-primary tv-auth-submit">Ingresar</button>
      </form>
      ${signupBlock}
    </div>`;

  return renderLayout({ title: "Login", body, showNav: false });
}

export function renderAuthRegisterPage(options: {
  error?: string;
  next?: string;
}): string {
  const errorBlock = options.error
    ? `<div class="alert alert-error">${escapeHtml(options.error)}</div>`
    : "";

  const body = `
    <div class="tv-auth-card">
      ${renderAuthBrand("telvoice", "Crear cuenta · solo con correo Gmail")}
      ${errorBlock}
      <form method="post" action="/admin/register" class="tv-auth-form">
        <input type="hidden" name="next" value="${escapeHtml(options.next ?? "/admin")}" />
        <div class="form-group">
          <label for="name">Nombre</label>
          <input id="name" name="name" type="text" required autocomplete="name" placeholder="Tu nombre" />
        </div>
        <div class="form-group">
          <label for="email">Gmail</label>
          <input id="email" name="email" type="email" required autocomplete="email" placeholder="nombre@gmail.com" />
          <p class="field-hint">Solo @gmail.com o @googlemail.com</p>
        </div>
        <div class="form-group">
          <label for="password">Contraseña</label>
          <input id="password" name="password" type="password" required autocomplete="new-password" minlength="8" />
          <p class="field-hint">Mínimo 8 caracteres</p>
        </div>
        <div class="form-group">
          <label for="password_confirm">Confirmar contraseña</label>
          <input id="password_confirm" name="password_confirm" type="password" required autocomplete="new-password" minlength="8" />
        </div>
        <button type="submit" class="btn btn-primary tv-auth-submit">Crear cuenta e ingresar</button>
      </form>
      <p class="tv-auth-foot">
        ¿Ya tienes cuenta? <a href="/admin/login">Iniciar sesión</a>
      </p>
    </div>`;

  return renderLayout({ title: "Registro", body, showNav: false });
}
