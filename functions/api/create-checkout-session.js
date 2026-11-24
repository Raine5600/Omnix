import { createCheckout } from "../_lib/checkout.mjs";

export async function onRequest(context) {
  return createCheckout(context.request, context.env);
}
