import { nowSec } from "./http.mjs";
import { rangeWindow } from "./stats.mjs";

const PRODUCTION_HOSTS = new Set([
  "omnixgenerational.com",
  "www.omnixgenerational.com",
]);

function hostname(request) {
  try {
    return new URL(request.url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

// Sample data is for preview and local wrangler only.
// DEMO_MODE=1 on the public site, or on the production Pages hostname, does nothing.
export function demoAllowed(request, env) {
  if (String((env && env.DEMO_MODE) || "").trim() !== "1") return false;
  const branch = String((env && (env.CF_PAGES_BRANCH || env.CF_PAGES_BRANCH_NAME)) || "").trim().toLowerCase();
  if (branch === "main" || branch === "master") return false;
  const host = hostname(request);
  if (!host || PRODUCTION_HOSTS.has(host)) return false;
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
  if (host.endsWith(".pages.dev")) return host.split(".").filter(Boolean).length >= 4;
  return false;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function utcStamp(nowSec, { daysBack = 0, hour = 12 }) {
  const now = new Date(nowSec * 1000);
  return Math.floor(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysBack,
    hour,
    0,
    0
  ) / 1000);
}

export function sampleAnalytics(range, now = nowSec()) {
  const window = rangeWindow(range, now);
  const t = [];
  if (window.range === "day") {
    const endHour = Math.floor(now / 3600) * 3600;
    for (let i = 23; i >= 0; i -= 1) t.push(endHour - i * 3600);
  } else {
    const days = window.range === "month" ? 30 : 7;
    for (let i = days - 1; i >= 0; i -= 1) t.push(utcStamp(now, { daysBack: i, hour: 12 }));
  }
  const visitors = [];
  const pageviews = [];
  const clicks = [];
  for (let i = 0; i < t.length; i += 1) {
    const wave = 8 + Math.round(5 * Math.sin(i / 2.2)) + (i > t.length - 6 ? 4 : 0);
    visitors.push(Math.max(1, wave));
    pageviews.push(wave + 4 + (i % 3));
    clicks.push(1 + (i % 4));
  }
  return {
    sample: true,
    range: window.range,
    totals: {
      visitors: sum(visitors),
      pageviews: sum(pageviews),
      clicks: sum(clicks),
    },
    series: { t, visitors, pageviews, clicks },
    top_pages: [
      { path: "/", views: 42, visitors: 18 },
      { path: "/pricing", views: 27, visitors: 14 },
      { path: "/start", views: 21, visitors: 11 },
      { path: "/about", views: 9, visitors: 6 },
    ],
    entry_pages: [
      { path: "/", n: 16 },
      { path: "/pricing", n: 7 },
      { path: "/start", n: 5 },
    ],
    referrers: [
      { referrer: "https://www.google.com/", n: 18 },
      { referrer: "(direct)", n: 11 },
      { referrer: "https://www.facebook.com/", n: 6 },
    ],
    clicks_by_element: [
      { element: "cta:buy", n: 14 },
      { element: "cta:book-a-call", n: 9 },
      { element: "package:never-miss-a-job", n: 8 },
      { element: "carousel:never-miss-a-job", n: 6 },
      { element: "nav:pricing", n: 5 },
      { element: "cta:free-guide", n: 3 },
    ],
  };
}

export async function ensureDemoContent(db) {
  const seeded = await db.prepare("SELECT version FROM schema_migrations WHERE version = 'demo-v2'").first();
  if (seeded) return;
  const now = nowSec();
  const day = 86400;
  await db.prepare("DELETE FROM chat_messages WHERE is_demo = 1").run();
  await db.prepare("DELETE FROM refund_requests WHERE is_demo = 1").run();
  await db.prepare("DELETE FROM change_requests WHERE is_demo = 1").run();
  await db.prepare("DELETE FROM intake_submissions WHERE is_demo = 1").run();
  await db.prepare("DELETE FROM hubspot_contacts WHERE is_demo = 1").run();
  await db.prepare("DELETE FROM hubspot_form_submissions WHERE is_demo = 1").run();
  await db.prepare("DELETE FROM hubspot_threads WHERE is_demo = 1").run();
  await db.prepare("DELETE FROM clients WHERE is_demo = 1").run();

  async function client(name, email, goLive, tracked) {
    const row = await db.prepare(
      `INSERT INTO clients (name, email, go_live_date, first_tracked_customer_at, created_at, is_demo)
       VALUES (?, ?, ?, ?, ?, 1) RETURNING id`
    ).bind(name, email, goLive, tracked, now).first();
    return row.id;
  }

  const hvac = await client("Summit Air HVAC", "summit@example.com", new Date((now - 10 * day) * 1000).toISOString().slice(0, 10), null);
  const salon = await client("Lumen Hair Studio", "lumen@example.com", new Date((now - 45 * day) * 1000).toISOString().slice(0, 10), new Date((now - 2 * day) * 1000).toISOString());
  const auto = await client("Harbor Auto Repair", "harbor@example.com", new Date((now - 40 * day) * 1000).toISOString().slice(0, 10), null);
  const dental = await client("Brightside Dental", "brightside@example.com", null, null);
  const cleaning = await client("Maple and Co Cleaning", "maple@example.com", new Date((now - 20 * day) * 1000).toISOString().slice(0, 10), null);

  const refunds = [
    [hvac, "Summit Air HVAC", "never-miss-a-job", 19700],
    [salon, "Lumen Hair Studio", "never-miss-a-job", 19700],
    [auto, "Harbor Auto Repair", "answer-the-call", 9700],
    [dental, "Brightside Dental", "custom-ai", null],
  ];
  for (const [id, name, packageId, cents] of refunds) {
    await db.prepare(
      `INSERT INTO refund_requests (client_id, client_name, package_id, amount_cents, status, source, created_at, is_demo)
       VALUES (?, ?, ?, ?, 'pending', 'demo', ?, 1)`
    ).bind(id, name, packageId, cents, now).run();
  }

  await db.prepare(
    `INSERT INTO change_requests (client_id, client_name, request_text, suggestion, preview_url, status, created_at, is_demo)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, 1)`
  ).bind(
    hvac,
    "Summit Air HVAC",
    "Please show emergency hours on the homepage.",
    "Add a line under the phone number: Emergency service, 24 hours.",
    "https://example.com/preview/summit-hours",
    now
  ).run();
  await db.prepare(
    `INSERT INTO change_requests (client_id, client_name, request_text, suggestion, preview_url, status, created_at, is_demo)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, 1)`
  ).bind(
    auto,
    "Harbor Auto Repair",
    "Swap the hero photo for the shop-bay photo.",
    "Use the photo of the service bay with the bay doors open.",
    "https://example.com/preview/harbor-bay",
    now
  ).run();
  await db.prepare(
    `INSERT INTO change_requests (client_id, client_name, request_text, suggestion, preview_url, status, created_at, is_demo)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, 1)`
  ).bind(
    cleaning,
    "Maple and Co Cleaning",
    "List weekday cleaning hours under the phone number.",
    "Add Mon–Fri 8–4 under the phone number.",
    "https://example.com/preview/maple-hours",
    now
  ).run();

  await db.prepare(
    `INSERT INTO intake_submissions (created_at, name, business_name, phone, email, payload_json, hubspot_status, is_demo)
     VALUES (?, 'Alicia Gomez', 'Lumen Hair Studio', '3175550142', 'alicia@example.com', ?, 'sample', 1),
            (?, 'Dana Brooks', 'Maple and Co Cleaning', '3175550166', 'dana@example.com', ?, 'sample', 1)`
  ).bind(now - day, '{"services":"Cuts, color, and blowouts"}', now - 3600, '{"services":"Weekly office and home cleaning"}').run();

  await db.prepare(
    `INSERT INTO hubspot_contacts (id, email, name, phone, company, updated_at, synced_at, is_demo) VALUES
     ('demo-contact-1', 'alicia@example.com', 'Alicia Gomez', '3175550142', 'Lumen Hair Studio', ?, ?, 1),
     ('demo-contact-2', 'chris@example.com', 'Chris Patel', '3175550199', 'Harbor Auto Repair', ?, ?, 1),
     ('demo-contact-3', 'jamie@example.com', 'Jamie Cole', '3175550110', 'Brightside Dental', ?, ?, 1)`
  ).bind(now, now, now, now, now, now).run();

  await db.prepare(
    `INSERT INTO hubspot_form_submissions (id, form_id, form_name, submitted_at, email, summary, synced_at, is_demo) VALUES
     ('demo-form-1', 'demo', 'Contact form', ?, 'jamie@example.com', 'email: jamie@example.com · message: Need a site for the clinic', ?, 1),
     ('demo-form-2', 'demo', 'Contact form', ?, 'dana@example.com', 'email: dana@example.com · message: Book a call about cleaning routes', ?, 1)`
  ).bind(now - 7200, now, now - 18000, now).run();

  await db.prepare(
    `INSERT INTO hubspot_threads (id, status, preview, updated_at, synced_at, is_demo)
     VALUES ('demo-thread-1', 'OPEN', 'Sample thread. HubSpot was not contacted.', ?, ?, 1)`
  ).bind(now, now).run();

  await db.prepare(
    `INSERT INTO chat_messages (created_at, client_id, role, body, is_demo)
     VALUES (?, ?, 'user', 'Sample only: can we add online booking to the homepage?', 1)`
  ).bind(now, salon).run();
  await db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES ('demo-v2', ?)").bind(now).run();
}
