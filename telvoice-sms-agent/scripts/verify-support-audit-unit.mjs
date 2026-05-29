#!/usr/bin/env node
/**
 * Verificación rápida de merge de metadata.audit_log (sin BD).
 */
import {
  appendSupportTicketAuditEvent,
  getSupportTicketAuditLog,
} from "../dist/services/supportTicketAudit.js";

const actor = {
  actorType: "admin",
  actorName: "Test Op",
  actorEmail: "op@telvoice.cl",
  role: "telvoice_operator",
};

let meta = { foo: "bar" };
meta = appendSupportTicketAuditEvent(meta, actor, {
  action: "status_changed",
  from: "Abierto",
  to: "En revisión",
});
meta = appendSupportTicketAuditEvent(meta, actor, {
  action: "internal_note_added",
  detail: "nota secreta",
});

if (meta.foo !== "bar") {
  console.error("FAIL: perdió metadata existente");
  process.exit(1);
}
const log = getSupportTicketAuditLog(meta);
if (log.length !== 2) {
  console.error("FAIL: audit_log length", log.length);
  process.exit(1);
}
if (!meta.lastHandledBy?.email) {
  console.error("FAIL: lastHandledBy");
  process.exit(1);
}
console.log("OK support audit merge", log.map((e) => e.action).join(", "));
