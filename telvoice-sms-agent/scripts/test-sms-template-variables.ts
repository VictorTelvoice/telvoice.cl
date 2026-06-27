/**
 * Validación de resolución de variables SMS ({codigo}, {{nombre}}, etc.).
 */
import assert from "node:assert/strict";
import {
  SMS_PREVIEW_VERIFICATION_CODE,
  containsCodeTemplateTokens,
  generateSmsVerificationCode,
  messageHasUnresolvedNonCodeVars,
  resolveSmsTemplateVariables,
} from "../src/utils/smsTemplateVariables.js";

function testPreviewCodeTokens(): void {
  const tokens = [
    "{codigo}",
    "{{codigo}}",
    "{código}",
    "{{código}}",
    "{code}",
    "{{code}}",
  ];
  for (const token of tokens) {
    const msg = `tu codigo de google es: ${token}`;
    const resolved = resolveSmsTemplateVariables(msg, {}, { preview: true });
    assert.equal(
      resolved,
      `tu codigo de google es: ${SMS_PREVIEW_VERIFICATION_CODE}`,
      `preview ${token}`,
    );
    assert.ok(!containsCodeTemplateTokens(resolved), `sin literal ${token}`);
  }
  console.log("✓ tokens de código en preview → 123456");
}

function testLiveCodeTokens(): void {
  const tokens = ["{codigo}", "{{codigo}}", "{código}", "{{code}}"];
  for (const token of tokens) {
    const msg = `clave: ${token}`;
    const resolved = resolveSmsTemplateVariables(msg, {}, {
      preview: false,
      generateCode: () => "482913",
    });
    assert.equal(resolved, "clave: 482913", `live ${token}`);
    assert.ok(!containsCodeTemplateTokens(resolved));
  }
  console.log("✓ tokens de código en envío real");
}

function testUniqueCodePerRecipient(): void {
  const codes = new Set<string>();
  let seq = 0;
  for (let i = 0; i < 3; i++) {
    const resolved = resolveSmsTemplateVariables("OTP {codigo}", {}, {
      preview: false,
      generateCode: () => String(100000 + seq++),
    });
    const match = resolved.match(/\d{6}$/);
    assert.ok(match, "debe terminar en 6 dígitos");
    codes.add(match[0]!);
  }
  assert.equal(codes.size, 3, "cada destinatario debe recibir código distinto");
  console.log("✓ código distinto por destinatario (3 iteraciones)");
}

function testGenerateCodeFormat(): void {
  for (let i = 0; i < 50; i++) {
    const code = generateSmsVerificationCode();
    assert.match(code, /^\d{6}$/, "6 dígitos numéricos");
  }
  console.log("✓ generateSmsVerificationCode formato 6 dígitos");
}

function testNombreEmpresaFecha(): void {
  const withNombre = resolveSmsTemplateVariables("Hola {nombre}", {
    nombre: "Ana",
  });
  assert.equal(withNombre, "Hola Ana");

  const withDouble = resolveSmsTemplateVariables("Hola {{nombre}}", {
    nombre: "Luis",
  });
  assert.equal(withDouble, "Hola Luis");

  const withoutNombre = resolveSmsTemplateVariables("Hola {nombre}", {});
  assert.equal(withoutNombre, "Hola {nombre}");

  const mixed = resolveSmsTemplateVariables(
    "{nombre} {codigo} {empresa}",
    { nombre: "Pedro", empresa: "Acme" },
    { preview: true },
  );
  assert.equal(mixed, `Pedro ${SMS_PREVIEW_VERIFICATION_CODE} Acme`);
  console.log("✓ {nombre} / {{nombre}} / {empresa} sin romper {codigo}");
}

function testUnresolvedNonCodeVars(): void {
  assert.ok(messageHasUnresolvedNonCodeVars("Hola {nombre}"));
  assert.ok(!messageHasUnresolvedNonCodeVars("Hola {codigo}"));
  assert.ok(!messageHasUnresolvedNonCodeVars("Hola {{code}}"));
  assert.ok(
    messageHasUnresolvedNonCodeVars("Hola {nombre} codigo {codigo}"),
  );
  console.log("✓ detección vars no-código para aviso UI");
}

function testSegmentLengthUsesResolved(): void {
  const raw = "tu codigo de google es: {codigo}";
  const preview = resolveSmsTemplateVariables(raw, {}, { preview: true });
  assert.ok(preview.length > raw.length - 8, "preview más largo que token");
  assert.ok(!preview.includes("{codigo}"));
  console.log("✓ mensaje resuelto apto para conteo de caracteres");
}

function main(): void {
  testPreviewCodeTokens();
  testLiveCodeTokens();
  testUniqueCodePerRecipient();
  testGenerateCodeFormat();
  testNombreEmpresaFecha();
  testUnresolvedNonCodeVars();
  testSegmentLengthUsesResolved();
  console.log("\nTodos los tests de smsTemplateVariables pasaron.");
}

main();
