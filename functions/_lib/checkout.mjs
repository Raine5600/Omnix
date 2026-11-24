import { HttpError, json, readJson } from "./http.mjs";

// Same packages and copy as api/create-checkout-session.js. A client-sent amount is ignored.
export const PACKAGES = {
  "never-miss-a-job": {
    id: "never-miss-a-job",
    name: "Never Miss a Job",
    setupCents: 50000,
    monthlyCents: 19700,
    guarantee: true,
    monthlyDescription: "Monthly. Missed-call text-back with after-hours answering, non-gated review requests after every job, an estimate follow-up sequence, and a custom website. Phone, SMS, and AI usage are billed separately at cost. 30-day money-back guarantee: first month back if no tracked paying customer within 30 days of going live. Setup fee is not refundable.",
    setupDescription: "One-time setup. Live within 7 days of purchase. Starts with a short kickoff call. This setup fee is not refundable.",
    cancelPath: "/pricing",
  },
  "answer-the-call": {
    id: "answer-the-call",
    name: "Answer the Call",
    setupCents: 35000,
    monthlyCents: 9700,
    guarantee: true,
    monthlyDescription: "Monthly. Missed-call text-back with after-hours answering and a custom website. Does not include review requests or estimate follow-up. Phone, SMS, and AI usage are billed separately at cost. 30-day money-back guarantee: first month back if no tracked paying customer within 30 days of going live. Setup fee is not refundable.",
    setupDescription: "One-time setup. Live within 7 days of purchase. Starts with a short kickoff call. This setup fee is not refundable.",
    cancelPath: "/start",
  },
};

function encodeFormValue(value) {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

export function buildCheckoutBody(origin, pkg) {
  const lines = [
    "mode=subscription",
    "billing_address_collection=required",
    "allow_promotion_codes=true",
    `success_url=${encodeFormValue(`${origin}/success?type=purchase&package=${pkg.id}&session_id=`)}{CHECKOUT_SESSION_ID}`,
    `cancel_url=${encodeFormValue(`${origin}${pkg.cancelPath}`)}`,
    "line_items[0][quantity]=1",
    "line_items[0][price_data][currency]=usd",
    `line_items[0][price_data][unit_amount]=${pkg.monthlyCents}`,
    "line_items[0][price_data][recurring][interval]=month",
    `line_items[0][price_data][product_data][name]=${encodeFormValue(pkg.name)}`,
    `line_items[0][price_data][product_data][description]=${encodeFormValue(pkg.monthlyDescription)}`,
    "line_items[1][quantity]=1",
    "line_items[1][price_data][currency]=usd",
    `line_items[1][price_data][unit_amount]=${pkg.setupCents}`,
    `line_items[1][price_data][product_data][name]=${encodeFormValue(`${pkg.name} — Setup`)}`,
    `line_items[1][price_data][product_data][description]=${encodeFormValue(pkg.setupDescription)}`,
  ];
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

  const pkg = PACKAGES[body.product];
  if (!pkg) {
    return json({ error: "That package cannot be purchased here." }, 400);
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
      body: buildCheckoutBody(origin, pkg),
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
