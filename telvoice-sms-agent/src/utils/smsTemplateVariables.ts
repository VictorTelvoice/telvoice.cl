import { randomInt } from "node:crypto";

/** Código fijo para vista previa UI (teléfono, contador de caracteres). */
export const SMS_PREVIEW_VERIFICATION_CODE = "123456";

export type SmsTemplateVariableContext = {
  nombre?: string | null;
  empresa?: string | null;
  fecha?: string | null;
  /** Si se indica, se usa en envío real en lugar de generar uno nuevo. */
  codigo?: string | null;
};

export type ResolveSmsTemplateOptions = {
  /** true → código de ejemplo 123456; false → aleatorio de 6 dígitos. */
  preview?: boolean;
  /** Generador custom (p. ej. tests); por defecto `generateSmsVerificationCode`. */
  generateCode?: () => string;
};

/** Tokens de código OTP: {codigo}, {{codigo}}, {código}, {{code}}, etc. */
export const SMS_CODE_TOKEN_RE =
  /\{\{?(?:codigo|código|code)\}\}?/gi;

/** Variables simples opcionales: nombre, empresa, fecha (simple o doble llave). */
export const SMS_SIMPLE_VAR_RE = /\{\{?(nombre|empresa|fecha)\}\}?/gi;

/** Código numérico aleatorio de 6 dígitos (puede empezar con 0). */
export function generateSmsVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function resolveSmsTemplateVariables(
  message: string,
  context: SmsTemplateVariableContext = {},
  options: ResolveSmsTemplateOptions = {},
): string {
  let out = String(message ?? "");

  const code = options.preview
    ? SMS_PREVIEW_VERIFICATION_CODE
    : (context.codigo?.trim() ||
        (options.generateCode?.() ?? generateSmsVerificationCode()));

  out = out.replace(SMS_CODE_TOKEN_RE, code);

  out = out.replace(SMS_SIMPLE_VAR_RE, (match, key: string) => {
    const normalized = key.toLowerCase() as keyof SmsTemplateVariableContext;
    const val = context[normalized];
    if (val != null && String(val).trim() !== "") {
      return String(val).trim();
    }
    return match;
  });

  return out;
}

/** true si quedan variables distintas de código (p. ej. {nombre} sin valor). */
export function messageHasUnresolvedNonCodeVars(text: string): boolean {
  const stripped = String(text ?? "").replace(SMS_CODE_TOKEN_RE, "");
  return /\{\{?[a-zA-Z_\u00C0-\u024F][a-zA-Z0-9_\u00C0-\u024F]*\}?/.test(
    stripped,
  );
}

export function containsCodeTemplateTokens(message: string): boolean {
  SMS_CODE_TOKEN_RE.lastIndex = 0;
  return SMS_CODE_TOKEN_RE.test(String(message ?? ""));
}

/** Script inline para preview en páginas Enviar SMS / Plantillas. */
export function renderSmsTemplateVariablesPreviewScript(): string {
  const previewCode = JSON.stringify(SMS_PREVIEW_VERIFICATION_CODE);
  return `(function(){
  var PREVIEW_CODE = ${previewCode};
  var CODE_RE = /\\{\\{?(?:codigo|código|code)\\}\\}?/gi;
  var SIMPLE_RE = /\\{\\{?(nombre|empresa|fecha)\\}\\}?/gi;
  window.resolveSmsTemplatePreview = function(message, context){
    context = context || {};
    var out = String(message || '');
    out = out.replace(CODE_RE, PREVIEW_CODE);
    out = out.replace(SIMPLE_RE, function(m, k){
      var v = context[k];
      if(v != null && String(v).trim() !== '') return String(v).trim();
      return m;
    });
    return out;
  };
  window.messageHasUnresolvedNonCodeVars = function(text){
    var stripped = String(text || '').replace(CODE_RE, '');
    return /\\{\\{?[a-zA-Z_\\u00C0-\\u024F][a-zA-Z0-9_\\u00C0-\\u024F]*\\}?/.test(stripped);
  };
})();`;
}
