import { adminEmail, readSession } from "../_lib/auth.mjs";
import { renderDashboard, renderLogin } from "../_lib/admin-page.mjs";
import { demoAllowed } from "../_lib/demo.mjs";
import { ensureSchema } from "../_lib/schema.mjs";

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET", "x-robots-tag": "noindex, nofollow" },
    });
  }

  let session = null;
  try {
    if (env && env.DB) {
      await ensureSchema(env.DB);
      session = await readSession(env.DB, request);
    }
  } catch (err) {
    console.error("admin session");
  }

  const configured = Boolean(String((env && env.ADMIN_PASSWORD_HASH) || "").trim());
  const html = session
    ? renderDashboard({ email: adminEmail(env), csrf: session.csrf, sample: demoAllowed(request, env) })
    : renderLogin({ configured });

  return new Response(request.method === "HEAD" ? null : html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noindex, nofollow",
      "cache-control": "no-store",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
    },
  });
}
