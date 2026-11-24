import assert from "node:assert/strict";

const base = process.env.OMNIX_BASE || "http://127.0.0.1:8788";
const password = process.env.OMNIX_TEST_PASSWORD;
if (!password) {
  console.error("Set OMNIX_TEST_PASSWORD");
  process.exit(1);
}

async function send(path, options = {}) {
  const response = await fetch(base + path, options);
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { response, text, json };
}

function cookie(response) {
  const raw = response.headers.get("set-cookie") || "";
  const match = raw.match(/omnix_session=([^;]+)/);
  return match ? match[1] : "";
}

let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log("ok", name);
  } catch (err) {
    failed += 1;
    console.error("FAIL", name, err && err.message ? err.message : err);
  }
}

await check("clean url and old redirect", async () => {
  const start = await fetch(base + "/start", { redirect: "manual" });
  assert.equal(start.status, 200);
  const slash = await fetch(base + "/start/", { redirect: "manual" });
  assert.equal(slash.status, 301);
  const old = await fetch(base + "/testimonials", { redirect: "manual" });
  assert.equal(old.status, 301);
});

await check("checkout refuses other products and does not charge", async () => {
  const other = await send("/api/create-checkout-session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ product: "custom-ai" }),
  });
  assert.equal(other.response.status, 400);
  const core = await send("/api/create-checkout-session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ product: "never-miss-a-job" }),
  });
  assert.equal(core.response.status, 500);
  assert.match(core.json.error, /not configured/);
});

await check("intake validates then accepts", async () => {
  const bad = await send("/api/intake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Pat" }),
  });
  assert.equal(bad.response.status, 400);
  const good = await send("/api/intake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ business_name: "HTTP Test Co", email: "http-test@example.com", services: "Drain cleaning" }),
  });
  assert.equal(good.response.status, 200);
  assert.equal(good.json.ok, true);
});

await check("tracker drops bots and accepts a browser", async () => {
  const bot = await send("/api/t", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "curl/8.0" },
    body: JSON.stringify({ t: "view", p: "/bot-should-not-appear" }),
  });
  assert.equal(bot.response.status, 204);
  const view = await send("/api/t", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    },
    body: JSON.stringify({ t: "view", p: "/tracked-mobile-check", r: "https://www.google.com/search?q=secret", us: "google" }),
  });
  assert.equal(view.response.status, 204);
});

await check("admin session, sample data, and refund decision", async () => {
  const anon = await send("/api/admin/queue");
  assert.equal(anon.response.status, 401);
  const login = await send("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.11" },
    body: JSON.stringify({ email: "raine5600@gmail.com", password }),
  });
  assert.equal(login.response.status, 200);
  const token = cookie(login.response);
  assert.ok(token);
  const page = await send("/admin", { headers: { cookie: `omnix_session=${token}` } });
  assert.match(page.text, /noindex, nofollow/);
  assert.match(page.text, /Sample data for this preview/);
  const csrf = (page.text.match(/name="csrf-token" content="([^"]+)"/) || [])[1];
  assert.ok(csrf);
  const headers = {
    cookie: `omnix_session=${token}`,
    "content-type": "application/json",
    "x-csrf-token": csrf,
  };
  const noCsrf = await send("/api/admin/settings", {
    method: "POST",
    headers: { cookie: headers.cookie, "content-type": "application/json" },
    body: JSON.stringify({ change_type: "hours", enabled: true }),
  });
  assert.equal(noCsrf.response.status, 403);
  const refundToggle = await send("/api/admin/settings", {
    method: "POST",
    headers,
    body: JSON.stringify({ change_type: "refund", enabled: true }),
  });
  assert.equal(refundToggle.response.status, 400);
  const saved = await send("/api/admin/settings", {
    method: "POST",
    headers,
    body: JSON.stringify({ change_type: "hours", enabled: true }),
  });
  assert.equal(saved.json.applied, false);
  await send("/api/admin/settings", {
    method: "POST",
    headers,
    body: JSON.stringify({ change_type: "hours", enabled: false }),
  });
  const analytics = await send("/api/admin/analytics?range=week", { headers: { cookie: headers.cookie } });
  assert.equal(analytics.json.sample, true);
  assert.equal(JSON.stringify(analytics.json).includes("203.0.113"), false);
  const queue = await send("/api/admin/queue", { headers: { cookie: headers.cookie } });
  assert.ok(queue.json.refunds.length >= 1);
  const flagged = queue.json.refunds.find((row) => row.flagged && row.status === "pending");
  assert.ok(flagged);
  assert.equal(flagged.amount_cents, 19700);
  const created = await send("/api/admin/refunds", {
    method: "POST",
    headers,
    body: JSON.stringify({ client_name: "HTTP Test HVAC", email: "http-refund@example.com", go_live_date: "2026-01-01", amount_cents: 1 }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.json.amount_cents, 19700);
  assert.equal(created.json.stripe, "not_called");
  const decision = await send(`/api/admin/refunds/${created.json.id}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ status: "approved", note: "Record only" }),
  });
  assert.equal(decision.json.stripe, "not_called");
  assert.match(decision.json.message, /No refund was sent to Stripe/);
  const sync = await send("/api/admin/sync", { method: "POST", headers, body: "{}" });
  assert.equal(sync.json.sample, true);
});

await check("login locks after five failures", async () => {
  const ip = { "cf-connecting-ip": "203.0.113.50" };
  for (let i = 0; i < 5; i += 1) {
    const attempt = await send("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json", ...ip },
      body: JSON.stringify({ email: "raine5600@gmail.com", password: "not-the-password" }),
    });
    assert.equal(attempt.response.status, 401);
  }
  const locked = await send("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", ...ip },
    body: JSON.stringify({ email: "raine5600@gmail.com", password }),
  });
  assert.equal(locked.response.status, 429);
});

await check("hash tool is noindex", async () => {
  const tool = await send("/admin/hash-tool.html");
  assert.equal(tool.response.status, 200);
  assert.match(tool.text, /noindex, nofollow/);
  assert.match(tool.response.headers.get("x-robots-tag") || "", /noindex/);
});

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("http tests passed");
