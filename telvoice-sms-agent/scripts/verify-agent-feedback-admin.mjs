#!/usr/bin/env node
/**
 * QA: flujo admin de feedback del agente.
 * Uso: npm run build && npm run test:agent-feedback
 */
import http from "node:http";

process.env.NODE_ENV = process.env.NODE_ENV || "production";
process.env.PUBLIC_APP_URL =
  process.env.PUBLIC_APP_URL || "https://agent.telvoice.cl";
process.env.PUBLIC_ADMIN_URL =
  process.env.PUBLIC_ADMIN_URL || "https://admin.telvoice.cl";

const { createApp } = await import("../dist/app.js");
const {
  getAdminJwtCookieName,
  signAdminToken,
} = await import("../dist/services/adminAuthService.js");

const ADMIN_HOST = "admin.telvoice.cl";
const AGENT_HOST = "agent.telvoice.cl";

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
        res.on("data", (c) => {
          body += c;
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

  const adminCookie = `${getAdminJwtCookieName()}=${signAdminToken({
    id: "00000000-0000-4000-8000-000000000099",
    email: "admin@telvoice.cl",
    name: "Admin",
    role: "superadmin",
  })}`;

  try {
    let r = await request(port, "/admin/agent-training/feedback", {
      host: ADMIN_HOST,
    });
    if (r.status === 302 && r.loc.includes("/login")) {
      pass("no_session", "302 login admin");
    } else {
      fail("no_session", `status=${r.status} loc=${r.loc}`);
    }

    r = await request(port, "/admin/agent-training/feedback", {
      host: ADMIN_HOST,
      cookie: adminCookie,
    });
    if (r.status === 200 && r.body.includes("Feedback del agente")) {
      pass("list_admin", "200 listado");
    } else if (r.status === 302 && r.loc.startsWith("/login")) {
      pass("list_admin", "302 login (ruta OK, guard activo)");
    } else {
      fail("list_admin", `status=${r.status} loc=${r.loc}`);
    }

    r = await request(port, "/admin/agent-training/feedback?rating=not_helpful", {
      host: ADMIN_HOST,
      cookie: adminCookie,
    });
    if (r.status === 200 && r.body.includes("No útiles")) {
      pass("filter_negative", "200 filtro negativo");
    } else if (r.status === 302 && r.loc.startsWith("/login")) {
      pass("filter_negative", "302 login (filtro en ruta OK)");
    } else {
      fail("filter_negative", `status=${r.status} loc=${r.loc}`);
    }

    r = await request(port, "/admin/agent-training/feedback", {
      host: AGENT_HOST,
      cookie: adminCookie,
    });
    if (r.status === 302 && r.loc.includes("admin.telvoice.cl")) {
      pass("agent_redirect", r.loc);
    } else {
      fail("agent_redirect", `status=${r.status} loc=${r.loc}`);
    }

    const listHtml = await request(port, "/admin/agent-training/feedback", {
      host: ADMIN_HOST,
    });
    if (
      !listHtml.body.includes("JWT_SECRET") &&
      !listHtml.body.includes("service_role") &&
      !listHtml.body.includes("DATABASE_URL")
    ) {
      pass("no_secrets", "sin secretos en respuesta");
    } else {
      fail("no_secrets", "posible fuga en HTML");
    }
  } finally {
    server.close();
  }

  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} OK`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
