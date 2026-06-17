#!/usr/bin/env node
/**
 * Dry-run: plantilla email al equipo cuando el cliente responde un ticket.
 * Uso: node scripts/verify-support-client-reply-email-template.mjs
 */
import { renderSupportTicketClientReplyToAdmin } from "../dist/services/transactionalEmailTemplates.js";

const sample = renderSupportTicketClientReplyToAdmin({
  ticketCode: "TLV-1004",
  subject: "Problema en la API",
  statusLabel: "Esperando respuesta",
  companyName: "Licantravel",
  clientEmail: "licantravel@gmail.com",
  clientName: "Licantravel",
  replyMessage:
    "Gracias por la respuesta. Confirmo que ya puedo usar la clave de prueba.",
  panelUrl:
    "https://agent.telvoice.cl/admin/support?ticket=5a6f8157-38ca-4681-8153-71cc6bf4ca56",
  updatedAt: new Date().toISOString(),
});

console.log("subject:", sample.subject);
console.log("text:\n", sample.text);
console.log("html length:", sample.html.length);

const checks = [
  ["Soporte Telvoice", sample.html.includes("Soporte Telvoice")],
  ["TLV-1004", sample.html.includes("TLV-1004")],
  ["CTA superadmin", sample.html.includes("Ver ticket en superadmin")],
  ["sin script", !sample.html.includes("<script")],
];

for (const [label, ok] of checks) {
  if (!ok) {
    process.exitCode = 1;
    console.error(`FAIL: ${label}`);
  }
}

if (!process.exitCode) {
  console.log("OK — plantilla support ticket client reply to admin");
}
