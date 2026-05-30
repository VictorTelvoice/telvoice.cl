#!/usr/bin/env node
/**
 * QA: routing por subdominio admin.telvoice.cl vs agent.telvoice.cl.
 * Uso: npm run build && npm run verify:admin-subdomain
 */
import http from "node:http";

process.env.NODE_ENV = process.env.NODE_ENV || "production";
process.env.PUBLIC_APP_URL =
  process.env.PUBLIC_APP_URL || "https://agent.telvoice.cl";
process.env.PUBLIC_ADMIN_URL =
  process.env.PUBLIC_ADMIN_URL || "https://admin.telvoice.cl";

const { createApp } = await import("../dist/app.js");
const { getClientJwtCookieName, signAdminToken } = await import(
  "../dist/services/adminAuthService.js"
);

const AGENT_HOST = "agent.telvoice.cl";
const ADMIN_HOST = "admin.telvoice.cl";
const ADMIN_BASE = process.env.PUBLIC_ADMIN_URL.replace(/\/$/, "");
const AGENT_BASE = process.env.PUBLIC_APP_URL.replace(/\/$/, "");

const results = [];
const pass = (id, d) => {
  results.push({ id, ok: true, d });
  console.log(`✓ ${id}: ${d}`);
};
const fail = (id, d) => {
  results.push({ id, ok: false, d });
  console.error(`✗ ${id}: ${d}`);
};

function request(port, path, { host, cookie, method = "GET" } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          Host: host,
          ...(cookie ? { Cookie: cookie } : {}),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            loc: res.headers.location || "",
            body,
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    let r = await request(port, "/admin", { host: AGENT_HOST });
    if (r.status === 302 && r.loc === `${ADMIN_BASE}/admin`) {
      pass("agent_admin_redirect", r.loc);
    } else {
      fail("agent_admin_redirect", `status=${r.status} loc=${r.loc}`);
    }

    r = await request(port, "/admin/login?next=%2Fadmin", { host: AGENT_HOST });
    if (r.status === 302 && r.loc === `${ADMIN_BASE}/login?next=%2Fadmin`) {
      pass("agent_admin_login_redirect", r.loc);
    } else {
      fail("agent_admin_login_redirect", `status=${r.status} loc=${r.loc}`);
    }

    r = await request(port, "/admin/support", { host: ADMIN_HOST });
    if (r.status === 302 && r.loc.startsWith("/login") && !r.loc.includes("/app")) {
      pass("admin_no_session", r.loc);
    } else {
      fail("admin_no_session", `status=${r.status} loc=${r.loc}`);
    }

    const clientCookie = `${getClientJwtCookieName()}=${signAdminToken({
      id: "00000000-0000-4000-8000-000000000001",
      email: "cliente.demo@telvoice.cl",
      name: "Demo",
      role: "client_owner",
    })}`;

    r = await request(port, "/admin", { host: ADMIN_HOST, cookie: clientCookie });
    if (r.status === 302 && r.loc.startsWith("/login") && !r.loc.includes("/app")) {
      pass("admin_client_session_rejected", r.loc);
    } else {
      fail("admin_client_session_rejected", `status=${r.status} loc=${r.loc}`);
    }

    r = await request(port, "/login", { host: ADMIN_HOST, cookie: clientCookie });
    if (r.status === 200 && !r.body.includes('href="/app/dashboard"')) {
      pass("admin_login_with_client_session", "200 login admin");
    } else {
      fail(
        "admin_login_with_client_session",
        `status=${r.status} loc=${r.loc}`,
      );
    }

    const adminCookie = `tv_admin_session=${signAdminToken({
      id: "00000000-0000-4000-8000-000000000099",
      email: "admin@telvoice.cl",
      name: "Admin",
      role: "superadmin",
    })}`;

    r = await request(port, "/admin", { host: ADMIN_HOST, cookie: adminCookie });
    if (r.status === 302 && r.loc.startsWith("/login") && !r.loc.includes("/app")) {
      pass("admin_jwt_without_db_user", "login requerido (sin usuario en BD)");
    } else {
      fail("admin_jwt_without_db_user", `status=${r.status} loc=${r.loc}`);
    }

    r = await request(port, "/app/dashboard", { host: AGENT_HOST });
    if (r.status === 302 && r.loc.includes("/login")) {
      pass("agent_app_needs_login", r.loc);
    } else {
      fail("agent_app_needs_login", `status=${r.status} loc=${r.loc}`);
    }

    r = await request(port, "/app/dashboard", {
      host: AGENT_HOST,
      cookie: clientCookie,
    });
    if (r.status === 302 && r.loc.includes("/login")) {
      pass("agent_app_fake_client_cookie", "302 login (JWT sin usuario BD)");
    } else {
      fail("agent_app_fake_client_cookie", `status=${r.status} loc=${r.loc}`);
    }

    r = await request(port, "/health", { host: AGENT_HOST });
    if (r.status === 200 && r.body.includes('"status":"ok"')) {
      pass("agent_health", "200");
    } else {
      fail("agent_health", `status=${r.status}`);
    }

    r = await request(port, "/app", { host: ADMIN_HOST });
    if (r.status === 302 && r.loc.startsWith(`${AGENT_BASE}/app`)) {
      pass("admin_blocks_app", r.loc);
    } else {
      fail("admin_blocks_app", `status=${r.status} loc=${r.loc}`);
    }

    r = await request(port, "/", { host: ADMIN_HOST });
    if (r.status === 302 && r.loc === "/login") {
      pass("admin_root_login", r.loc);
    } else {
      fail("admin_root_login", `status=${r.status} loc=${r.loc}`);
    }
  } finally {
    server.close();
  }

  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} OK`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
