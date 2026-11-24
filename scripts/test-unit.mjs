import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { demoAllowed, sampleAnalytics } from "../functions/_lib/demo.mjs";
import { hashPassword, verifyPassword } from "../functions/_lib/password.mjs";
import { buildCheckoutBody, createCheckout, PACKAGES } from "../functions/_lib/checkout.mjs";
import { validateIntake } from "../functions/_lib/intake-validate.mjs";
import {
  assertRefundNotAutoApproved,
  daysSinceGoLive,
  refundFlags,
  refundOffer,
  presentRefund,
  shouldAutoApprove,
} from "../functions/_lib/refunds.mjs";
import { isBot, deviceClass, visitorHash, cleanReferrer } from "../functions/_lib/analytics.mjs";

const require = createRequire(import.meta.url);
const vercelIntake = require("../api/intake.js");

let failed = 0;
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log("ok", name))
    .catch((err) => {
      failed += 1;
      console.error("FAIL", name, err && err.message ? err.message : err);
    });
}

function request(url, env) {
  return demoAllowed(new Request(url), env || {});
}

await check("demo stays off without the flag", () => {
  assert.equal(request("http://localhost/admin", {}), false);
  assert.equal(request("http://localhost/admin", { DEMO_MODE: "0" }), false);
  assert.equal(request("http://127.0.0.1/admin", { DEMO_MODE: "1" }), true);
});

await check("demo works on localhost and preview hosts only", () => {
  assert.equal(request("http://localhost:8788/admin", { DEMO_MODE: "1" }), true);
  assert.equal(request("https://feature.omnix.pages.dev/admin", { DEMO_MODE: "1" }), true);
  assert.equal(request("https://omnix.pages.dev/admin", { DEMO_MODE: "1" }), false);
  assert.equal(request("https://omnixgenerational.com/admin", { DEMO_MODE: "1" }), false);
  assert.equal(request("https://www.omnixgenerational.com/admin", { DEMO_MODE: "1" }), false);
  assert.equal(request("https://feature.omnix.pages.dev/admin", { DEMO_MODE: "1", CF_PAGES_BRANCH: "main" }), false);
});

await check("sample chart is labeled and has points", () => {
  const week = sampleAnalytics("week", 1_700_000_000);
  assert.equal(week.sample, true);
  assert.equal(week.series.t.length, 7);
  assert.ok(week.totals.pageviews > 0);
});

await check("password hash round trip", async () => {
  const stored = await hashPassword("correct horse battery", 10000);
  assert.match(stored, /^pbkdf2\$10000\$[^$]+\$[^$]+$/);
  assert.equal(await verifyPassword("correct horse battery", stored), true);
  assert.equal(await verifyPassword("wrong horse battery", stored), false);
  assert.equal(await verifyPassword("correct horse battery", "nope"), false);
});

await check("refund flags and amount", () => {
  const now = new Date("2026-11-24T00:00:00Z");
  const early = refundFlags({ go_live_date: "2026-11-20", first_tracked_customer_at: null }, now);
  assert.equal(early.flagged, true);
  assert.equal(early.days, 4);
  assert.equal(refundOffer("never-miss-a-job").cents, 19700);
  assert.equal(refundOffer("answer-the-call").cents, 9700);
  assert.equal(refundOffer("custom-ai").covered, false);
  assert.equal(refundOffer("custom-ai").cents, null);
  const shown = presentRefund({ id: 1, client_name: "East", package_id: "answer-the-call", amount_cents: 1, go_live_date: "2026-10-01" }, now);
  assert.equal(shown.amount_cents, 9700);
  assert.equal(shown.covered, true);
  const uncovered = presentRefund({ id: 2, client_name: "North", package_id: "custom-ai", go_live_date: "2026-10-01" }, now);
  assert.equal(uncovered.covered, false);
  assert.equal(uncovered.flagged, true);
  assert.match(uncovered.reasons[0], /not covered/);
  const customer = refundFlags({ go_live_date: "2026-10-01", first_tracked_customer_at: "2026-11-01T00:00:00Z" }, now);
  assert.equal(customer.flagged, true);
  assert.equal(customer.hasCustomer, true);
  const clear = refundFlags({ go_live_date: "2026-10-01", first_tracked_customer_at: null }, now);
  assert.equal(clear.flagged, false);
  assert.equal(clear.days, daysSinceGoLive("2026-10-01", now));
  assert.equal(shouldAutoApprove("refund", { enabled: 1 }), false);
  assert.equal(shouldAutoApprove("hours", { enabled: 1 }), false);
  assert.throws(() => assertRefundNotAutoApproved("refund"), /never auto-approved/);
});

await check("checkout body matches the Vercel prices and does not call Stripe without a key", async () => {
  const body = buildCheckoutBody("https://omnixgenerational.com", PACKAGES["never-miss-a-job"]);
  assert.ok(body.includes("unit_amount]=19700"));
  assert.ok(body.includes("unit_amount]=50000"));
  assert.ok(body.includes("package%3Dnever-miss-a-job"));
  const answer = buildCheckoutBody("https://omnixgenerational.com", PACKAGES["answer-the-call"]);
  assert.ok(answer.includes("unit_amount]=9700"));
  assert.ok(answer.includes("unit_amount]=35000"));
  assert.ok(answer.includes("package%3Danswer-the-call"));
  assert.ok(body.includes("{CHECKOUT_SESSION_ID}"));
  assert.ok(body.includes("first+month+back+if+no+tracked+paying+customer"));
  assert.ok(body.includes("This+setup+fee+is+not+refundable."));
  let called = false;
  const original = globalThis.fetch;
  globalThis.fetch = () => {
    called = true;
    throw new Error("stripe should not be called");
  };
  try {
    const response = await createCheckout(new Request("https://example.com/api/create-checkout-session", {
      method: "POST",
      body: JSON.stringify({ product: "custom-ai" }),
    }), {});
    assert.equal(response.status, 400);
    const missing = await createCheckout(new Request("https://example.com/api/create-checkout-session", {
      method: "POST",
      body: JSON.stringify({ product: "never-miss-a-job" }),
    }), {});
    assert.equal(missing.status, 500);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = original;
  }
});

await check("intake validation matches the Vercel function", () => {
  const cases = [
    {},
    { name: "A" },
    { name: "A", phone: "123" },
    { name: "A", email: "not-an-email" },
    { business_name: "Co", email: "a@b.co" },
    { name: "A", phone: "3175550100", password: "nope" },
  ];
  for (const body of cases) {
    assert.equal(validateIntake(body), vercelIntake.validateIntake(body));
  }
});

await check("analytics does not keep the raw ip", async () => {
  assert.equal(isBot("curl/8.0"), true);
  assert.equal(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"), false);
  assert.equal(deviceClass("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148"), "mobile");
  const hash = await visitorHash("203.0.113.10", "Mozilla/5.0", "salt");
  assert.equal(hash.includes("203.0.113.10"), false);
  assert.equal(cleanReferrer("https://www.google.com/search?q=secret"), "https://www.google.com/search");
});

await check("public files hide admin and the tracker stays small", () => {
  const track = readFileSync(new URL("../track.js", import.meta.url));
  assert.ok(track.length < 1024, `track.js is ${track.length} bytes`);
  const robots = readFileSync(new URL("../robots.txt", import.meta.url), "utf8");
  assert.match(robots, /Disallow:\s+\/admin/);
  const sitemap = readFileSync(new URL("../sitemap.xml", import.meta.url), "utf8");
  assert.equal(sitemap.includes("/admin"), false);
  const privacy = readFileSync(new URL("../privacy.html", import.meta.url), "utf8");
  assert.equal(privacy.includes("This site uses cookieless first-party analytics (no cookies, no third-party trackers, no raw IP stored)."), true);
  const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.equal(/database_id\s*=/.test(wrangler), false);
  const tool = readFileSync(new URL("../admin/hash-tool.html", import.meta.url), "utf8");
  assert.match(tool, /noindex, nofollow/);
  assert.match(tool, /does not send your password anywhere/);
  assert.match(tool, /window\.fetch = blocked/);
  const adminApi = readFileSync(new URL("../functions/_lib/admin-api.mjs", import.meta.url), "utf8");
  const refunds = readFileSync(new URL("../functions/_lib/refunds.mjs", import.meta.url), "utf8");
  assert.equal(adminApi.includes("api.stripe.com"), false);
  assert.equal(refunds.includes("api.stripe.com"), false);
  assert.equal(refunds.includes("STRIPE"), false);
});

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("unit tests passed");
