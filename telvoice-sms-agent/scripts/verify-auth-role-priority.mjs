#!/usr/bin/env node
/**
 * Verifica que roles internos en admin_users no sean degradados por user_profiles cliente.
 */
import { subjectFromAdmin } from "../dist/auth/authorization.js";

const admin = {
  id: "admin-1",
  email: "victor@telvoice.net",
  name: "Victor",
  role: "superadmin",
};

const clientProfile = {
  profileId: "profile-1",
  adminUserId: "admin-1",
  authUserId: "auth-1",
  companyId: "company-1",
  email: "victor@telvoice.net",
  fullName: "Victor",
  role: "client_owner",
  status: "active",
  isInternal: false,
  fromDatabase: true,
};

const subject = subjectFromAdmin(admin, clientProfile);
if (subject.role !== "superadmin") {
  console.error(
    `FAIL: expected superadmin, got ${subject.role} (profile client_owner must not downgrade admin)`,
  );
  process.exit(1);
}

const clientAdmin = {
  id: "client-1",
  email: "cliente@telvoice.cl",
  name: "Cliente",
  role: "client_owner",
};

const clientSubject = subjectFromAdmin(clientAdmin, clientProfile);
if (clientSubject.role !== "client_owner") {
  console.error(`FAIL: expected client_owner, got ${clientSubject.role}`);
  process.exit(1);
}

console.log("OK: auth role priority (superadmin > client profile)");
