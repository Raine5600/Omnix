import { HttpError, json, readJson } from "../_lib/http.mjs";
import { validateIntake } from "../_lib/intake-validate.mjs";
import { storeIntake } from "../_lib/hubspot.mjs";
import { ensureSchema } from "../_lib/schema.mjs";

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  }
  try {
    const body = await readJson(context.request, 100000);
    const error = validateIntake(body);
    if (error) return json({ error }, 400);
    if (context.env && context.env.DB) await ensureSchema(context.env.DB);
    await storeIntake(context.env, body);
    return json({ ok: true });
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error("intake failed");
    return json({ ok: true });
  }
}
