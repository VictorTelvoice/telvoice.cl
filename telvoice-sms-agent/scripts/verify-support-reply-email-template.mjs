#!/usr/bin/env node
/**
 * Dry-run: renderiza plantilla de respuesta de ticket sin enviar correo.
 * Uso: node scripts/verify-support-reply-email-template.mjs
 */
import { renderSupportTicketReplyToClient } from "../dist/services/transactionalEmailTemplates.js";

const sample = renderSupportTicketReplyToClient({
  ticketCode: "TLV-1004",
  subject: "Problema en la API",
  statusLabel: "Esperando respuesta",
  companyName: "Licantravel",
  replyMessage: "Hola,\n\nRevisamos tu caso y activamos la clave de prueba.\n\nSaludos,\nEquipo Telvoice",
  authorName: "Equipo Telvoice",
  panelUrl: "https://agent.telvoice.cl/app/support?ticket=TLV-1004",
  updatedAt: new Date().toISOString(),
});

console.log("subject:", sample.subject);
console.log("text:\n", sample.text);
console.log("html length:", sample.html.length);
if (!sample.html.includes("Soporte Telvoice")) {
  process.exitCode = 1;
  console.error("FAIL: falta badge Soporte Telvoice");
}
if (!sample.html.includes("TLV-1004")) {
  process.exitCode = 1;
  console.error("FAIL: falta código TLV");
}
if (sample.html.includes("<script")) {
  process.exitCode = 1;
  console.error("FAIL: HTML inseguro");
}
console.log("OK — plantilla support ticket reply");
