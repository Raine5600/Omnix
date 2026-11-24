import { timingSafeEqualStr } from "../../_lib/bytes.mjs";
import { demoAllowed } from "../../_lib/demo.mjs";
import { json } from "../../_lib/http.mjs";
import { syncHubspot } from "../../_lib/hubspot.mjs";
import { ensureSchema } from "../../_lib/schema.mjs";

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, { Allow: "POST", "x-robots-tag": "noindex, nofollow" });
  }
  const secret = String((context.env && context.env.CRON_SECRET) || "");
  const header = context.request.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret) {
    return json({ error: "Cron is not configured." }, 503, { "x-robots-tag": "noindex, nofollow" });
  }
  if (!timingSafeEqualStr(provided, secret)) {
    return json({ error: "Forbidden." }, 401, { "x-robots-tag": "noindex, nofollow" });
  }
  if (context.env && context.env.DB) await ensureSchema(context.env.DB);
  if (demoAllowed(context.request, context.env)) {
    return json({ ok: true, sample: true, message: "Sample preview. HubSpot is not contacted." }, 200, { "x-robots-tag": "noindex, nofollow" });
  }
  const result = await syncHubspot(context.env);
  return json(result, 200, { "x-robots-tag": "noindex, nofollow" });
}
