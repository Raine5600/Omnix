import { recordEvent } from "../_lib/analytics.mjs";
import { ensureSchema } from "../_lib/schema.mjs";

export async function onRequest(context) {
  if (context.env && context.env.DB) {
    try {
      await ensureSchema(context.env.DB);
    } catch {
      console.error("analytics schema failed");
    }
  }
  return recordEvent(context.request, context.env);
}
