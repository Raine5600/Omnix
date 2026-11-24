import { HttpError, json, readJson } from "./http.mjs";

export const CORE_PRODUCT = "never-miss-a-job";
export const SETUP_CENTS = 50000;
export const MONTHLY_CENTS = 19700;

const MONTHLY_DESCRIPTION = "Monthly. Missed-call text-back with after-hours answering, non-gated review requests after every job, an estimate follow-up sequence, and a custom website. Phone, SMS, and AI usage are billed separately at cost. 30-day money-back guarantee: first month back if no tracked paying customer within 30 days of going live. Setup fee is not refundable.";
const SETUP_DESCRIPTION = "One-time setup. Live within 7 days of purchase. Starts with a short kickoff call. This setup fee is not refundable.";

function encodeFormValue(value) {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

export function buildCheckoutBody(origin) {
  const lines = [
    "mode=subscription",
    "billing_address_collection=required",
    "allow_promotion_codes=true",
    `success_url=${encodeFormValue(`${origin}/success?type=purchase&session_id=`)}{CHECKOUT_SESSION_ID}`,
    `cancel_url=${encodeFormValue(`${origin}/pricing`)}`,
  ];

  const items = [
    {
      name: "Never Miss a Job",
      description: MONTHLY_DESCRIPTION,
      unit_amount: MONTHLY_CENTS,
      interval: "month",
    },
    {
      name: "Never Miss a Job — Setup",
      description: SETUP_DESCRIPTION,
      unit_amount: SETUP_CENTS,
    },
  ];

  items.forEach((item, i) => {
    lines.push(`line_items[${i}][quantity]=1`);
    lines.push(`line_items[${i}][price_data][currency]=usd`);
    lines.push(`line_items[${i}][price_data][unit_amount]=${item.unit_amount}`);
    lines.push(`line_items[${i}][price_data][product_data][name]=${encodeFormValue(item.name)}`);
    lines.push(`line_items[${i}][price_data][product_data][description]=${encodeFormValue(item.description)}`);
    if (item.interval) {
      lines.push(`line_items[${i}][price_data][recurring][interval]=${item.interval}`);
    }
  });

  return lines.join("&");
}

export async function createCheckout(request, env) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  }

  let body;
  try {
    body = await readJson(request, 4000);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    return json({ error: "Send a JSON object." }, 400);
  }

  const product = body.product || CORE_PRODUCT;
  if (product !== CORE_PRODUCT) {
    return json({
      error: "Only Never Miss a Job can be purchased here. Other packages are proposed and are not for sale.",
    }, 400);
  }

  const key = env && env.STRIPE_SECRET_KEY;
  if (!key) return json({ error: "Checkout is not configured yet." }, 500);

  const origin = new URL(request.url).origin;
  let response;
  try {
    response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: buildCheckoutBody(origin),
    });
  } catch {
    return json({ error: "Could not start checkout." }, 500);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || !payload || !payload.url) {
    console.error("Stripe error", response.status);
    return json({ error: "Could not start checkout." }, 500);
  }
  return json({ url: payload.url });
}
