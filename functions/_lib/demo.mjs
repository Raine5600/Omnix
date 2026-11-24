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

export function sampleAnalytics(range, now = nowSec()) {
  const window = rangeWindow(range, now);
  const t = [];
  const visitors = [];
  const pageviews = [];
  const clicks = [];
  for (let i = 0; i < window.points; i += 1) {
    t.push(window.start + i * window.step);
    const wave = 8 + Math.round(5 * Math.sin(i / 2.2)) + (i > window.points - 6 ? 4 : 0);
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
  const existing = await db.prepare("SELECT COUNT(*) AS n FROM clients WHERE is_demo = 1").first();
  if (Number(existing && existing.n) > 0) return;
  const now = nowSec();
  const day = 86400;

  async function client(name, email, goLive, tracked) {
    const row = await db.prepare(
      `INSERT INTO clients (name, email, go_live_date, first_tracked_customer_at, created_at, is_demo)
       VALUES (?, ?, ?, ?, ?, 1) RETURNING id`
    ).bind(name, email, goLive, tracked, now).first();
    return row.id;
  }

  const summit = await client("Summit Air HVAC", "summit@example.com", new Date((now - 10 * day) * 1000).toISOString().slice(0, 10), null);
  const river = await client("Riverbend Plumbing", "river@example.com", new Date((now - 45 * day) * 1000).toISOString().slice(0, 10), new Date((now - 2 * day) * 1000).toISOString());
  const east = await client("Eastside Electric", "east@example.com", new Date((now - 40 * day) * 1000).toISOString().slice(0, 10), null);
  const north = await client("Northwind Roofing", "north@example.com", null, null);

  const refunds = [
    [summit, "Summit Air HVAC", "never-miss-a-job", 19700],
    [river, "Riverbend Plumbing", "never-miss-a-job", 19700],
    [east, "Eastside Electric", "answer-the-call", 9700],
    [north, "Northwind Roofing", "custom-ai", null],
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
    summit,
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
    east,
    "Eastside Electric",
    "Swap the hero photo for the truck photo.",
    "Replace the hero image with the truck in the driveway.",
    "https://example.com/preview/eastside-hero",
    now
  ).run();

  await db.prepare(
    `INSERT INTO intake_submissions (created_at, name, business_name, phone, email, payload_json, hubspot_status, is_demo)
     VALUES (?, 'Alicia Gomez', 'Summit Air HVAC', '3175550142', 'alicia@example.com', ?, 'sample', 1),
            (?, 'Chris Patel', 'Riverbend Plumbing', '3175550199', 'chris@example.com', ?, 'sample', 1)`
  ).bind(now - day, '{"services":"AC repair and install"}', now - 3600, '{"services":"Drain cleaning"}').run();

  await db.prepare(
    `INSERT INTO hubspot_contacts (id, email, name, phone, company, updated_at, synced_at, is_demo) VALUES
     ('demo-contact-1', 'alicia@example.com', 'Alicia Gomez', '3175550142', 'Summit Air HVAC', ?, ?, 1),
     ('demo-contact-2', 'chris@example.com', 'Chris Patel', '3175550199', 'Riverbend Plumbing', ?, ?, 1),
     ('demo-contact-3', 'jamie@example.com', 'Jamie Cole', '3175550110', 'Northwind Roofing', ?, ?, 1)`
  ).bind(now, now, now, now, now, now).run();

  await db.prepare(
    `INSERT INTO hubspot_form_submissions (id, form_id, form_name, submitted_at, email, summary, synced_at, is_demo) VALUES
     ('demo-form-1', 'demo', 'Contact form', ?, 'jamie@example.com', 'email: jamie@example.com · message: Need a website', ?, 1),
     ('demo-form-2', 'demo', 'Contact form', ?, 'pat@example.com', 'email: pat@example.com · message: Book a call', ?, 1)`
  ).bind(now - 7200, now, now - 18000, now).run();

  await db.prepare(
    `INSERT INTO hubspot_threads (id, status, preview, updated_at, synced_at, is_demo)
     VALUES ('demo-thread-1', 'OPEN', 'Sample thread. HubSpot was not contacted.', ?, ?, 1)`
  ).bind(now, now).run();

  await db.prepare(
    `INSERT INTO chat_messages (created_at, client_id, role, body, is_demo)
     VALUES (?, ?, 'user', 'Sample only: can you move the phone number into the header?', 1)`
  ).bind(now, summit).run();
}
