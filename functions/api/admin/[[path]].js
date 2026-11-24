import { handleAdmin } from "../../_lib/admin-api.mjs";

export async function onRequest(context) {
  return handleAdmin(context.request, context.env);
}
