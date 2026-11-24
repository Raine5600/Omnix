import {
  adminEmail,
  checkLogin,
  createSession,
  csrfOk,
  destroySession,
  ipHash,
  loginAllowed,
  readSession,
  recordLoginFailure,
  sessionClearCookie,
  sessionSetCookie,
} from "./auth.mjs";
import { demoAllowed, ensureDemoContent, sampleAnalytics } from "./demo.mjs";
import { HttpError, json, nowSec, readJson } from "./http.mjs";
import { leadsSnapshot, messagesSnapshot, syncHubspot } from "./hubspot.mjs";
import {
  createRefundRequest,
  decideRequest,
  listQueue,
  saveAutoApprove,
} from "./refunds.mjs";
import { ensureSchema } from "./schema.mjs";
import { analyticsReport } from "./stats.mjs";

function adminJson(data, status = 200, headers = {}) {
  return json(data, status, {
    "x-robots-tag": "noindex, nofollow",
    ...headers,
  });
}

function passwordConfigured(env) {
  return Boolean(String((env && env.ADMIN_PASSWORD_HASH) || "").trim());
}

async function login(request, env) {
  if (!passwordConfigured(env)) {
    return adminJson({
      error: "Admin login is not set up yet. Add the ADMIN_PASSWORD_HASH secret in Cloudflare, then reload this page.",
    }, 500);
  }
  const body = await readJson(request, 2000);
  const hash = await ipHash(request);
  const now = nowSec();
  if (!(await loginAllowed(env.DB, hash, now))) {
    return adminJson({ error: "Too many attempts. Try again in 15 minutes." }, 429);
  }
  const ok = await checkLogin(env, body.email, body.password);
  if (!ok) {
    await recordLoginFailure(env.DB, hash, now);
    return adminJson({ error: "Email or password is wrong." }, 401);
  }
  const session = await createSession(env.DB, now);
  return adminJson({ ok: true }, 200, { "set-cookie": sessionSetCookie(session.token, request) });
}

export async function handleAdmin(request, env) {
  try {
    if (!env || !env.DB) return adminJson({ error: "Database is not connected. In Cloudflare, bind the D1 database as DB." }, 500);
    await ensureSchema(env.DB);
    const demo = demoAllowed(request, env);
    if (demo) await ensureDemoContent(env.DB);
    const parts = new URL(request.url).pathname.replace(/^\/api\/admin\/?/, "").split("/").filter(Boolean);

    if (parts[0] === "login") {
      if (request.method !== "POST") return adminJson({ error: "Method not allowed" }, 405, { Allow: "POST" });
      return login(request, env);
    }

    const session = await readSession(env.DB, request);
    if (!session) return adminJson({ error: "Sign in required." }, 401);
    if (request.method !== "GET" && request.method !== "HEAD") {
      if (!csrfOk(request, session)) return adminJson({ error: "Refresh the page and try again." }, 403);
    }

    if (parts[0] === "logout" && request.method === "POST") {
      await destroySession(env.DB, request);
      return adminJson({ ok: true }, 200, { "set-cookie": sessionClearCookie(request) });
    }

    if (parts[0] === "analytics" && request.method === "GET") {
      const range = new URL(request.url).searchParams.get("range") || "week";
      if (demo) return adminJson(sampleAnalytics(range));
      const report = await analyticsReport(env.DB, range);
      report.sample = false;
      return adminJson(report);
    }

    if (parts[0] === "leads" && request.method === "GET") {
      const leads = await leadsSnapshot(env.DB, { demo });
      leads.sample = demo;
      return adminJson(leads);
    }

    if (parts[0] === "messages" && request.method === "GET") {
      const messages = await messagesSnapshot(env.DB, env, { demo });
      messages.sample = demo;
      if (demo) {
        messages.conversations_notice = "Sample preview. HubSpot is not contacted. When you connect it for real, conversations need scope conversations.read.";
      }
      return adminJson(messages);
    }

    if (parts[0] === "queue" && request.method === "GET") {
      const queue = await listQueue(env.DB, new Date(), { demo });
      queue.sample = demo;
      return adminJson(queue);
    }

    if (parts[0] === "sync" && request.method === "POST") {
      if (demo) {
        return adminJson({
          ok: true,
          sample: true,
          message: "Sample preview. HubSpot is not contacted.",
        });
      }
      return adminJson(await syncHubspot(env));
    }

    if (parts[0] === "settings" && request.method === "POST") {
      const body = await readJson(request, 2000);
      return adminJson(await saveAutoApprove(env.DB, body));
    }

    if (parts[0] === "refunds" && parts.length === 1 && request.method === "POST") {
      const body = await readJson(request, 8000);
      return adminJson(await createRefundRequest(env.DB, body), 201);
    }

    if ((parts[0] === "refunds" || parts[0] === "changes") && parts.length === 2 && request.method === "POST") {
      const body = await readJson(request, 8000);
      const kind = parts[0] === "refunds" ? "refund" : "change";
      return adminJson(await decideRequest(env.DB, kind, parts[1], body, { allowDemo: demo }));
    }

    return adminJson({ error: "Not found." }, 404);
  } catch (err) {
    if (err instanceof HttpError) return adminJson({ error: err.message }, err.status);
    console.error("admin", err && err.message ? err.message : "error");
    return adminJson({ error: "Something went wrong." }, 500);
  }
}

export { adminEmail };
