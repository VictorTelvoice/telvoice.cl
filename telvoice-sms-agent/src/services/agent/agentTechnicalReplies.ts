import { normalizeIntentText } from "../telegramIntentService.js";

export function buildTechnicalDoubtReply(message: string): string | null {
  const n = normalizeIntentText(message);

  if (/\b(integrar|integracion|integración|api|smpp|webhook)\b/.test(n)) {
    return (
      "Integración API Telvoice (Chile):\n\n" +
      "1. Solicita credenciales API y documentación a soporte o tu ejecutivo.\n" +
      "2. En el panel revisa /app/settings y permisos de tu cuenta.\n" +
      "3. Para envío HTTP usa el endpoint documentado con API key, Sender ID autorizado y números en formato 569XXXXXXXX.\n" +
      "4. Si usas SMPP, necesitas IP en whitelist del proveedor.\n\n" +
      "¿Quieres que te ayude con saldo, un envío de prueba desde el panel o una campaña?"
    );
  }

  if (
    /\b(no esta autorizado|no está autorizado|numero.*autorizado|número.*autorizado|destino.*autorizado|no autorizado)\b/.test(
      n,
    )
  ) {
    return (
      "Si el panel indica que el número de destino «no está autorizado», revisa:\n\n" +
      "• Formato internacional correcto (569XXXXXXXX, sin espacios).\n" +
      "• Si es envío live test: límites diarios y números permitidos en tu cuenta.\n" +
      "• Restricciones del proveedor (ruta, tipo P/T, país).\n" +
      "• Whitelist de IP si envías por API/SMPP desde un servidor nuevo.\n\n" +
      "Abre /app/inbox para ver el detalle del error en el mensaje fallido o contacta soporte con el ID del envío."
    );
  }

  return null;
}
