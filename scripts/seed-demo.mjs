#!/usr/bin/env node
/**
 * Optional local demo rows. Never run this against production.
 * The preview dashboard does not need this script: set DEMO_MODE=1 and
 * open /admin. Sample rows are created on that first visit, and that
 * mode stays off on omnixgenerational.com.
 * Usage: node scripts/seed-demo.mjs --local
 */

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

if (!process.argv.includes("--local") || process.argv.includes("--remote")) {
  console.error("Refusing to seed. Pass --local. This script never targets production.");
  process.exit(1);
}
if (process.env.OMNIX_ENV === "production" || process.env.CF_PAGES === "1") {
  console.error("Refusing to seed outside a local database.");
  process.exit(1);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function q(value) {
  if (value == null) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

const now = Math.floor(Date.now() / 1000);
const visitors = Array.from({ length: 18 }, (_, i) => `d${(i + 1).toString(16).padStart(2, "0")}${"a1b2c3d4".repeat(7)}`.slice(0, 64));
const paths = ["/", "/pricing", "/start", "/about", "/contact", "/faq", "/privacy"];
const refs = ["", "https://www.google.com/", "https://www.facebook.com/", "https://www.bing.com/"];
const devices = ["desktop", "mobile", "desktop", "tablet", "mobile"];
const elements = ["cta:buy", "cta:book-a-call", "nav:pricing", "nav:contact", "package:never-miss-a-job", "carousel:never-miss-a-job", "cta:free-guide", "nav:about"];

const views = [];
const clicks = [];
for (let day = 29; day >= 0; day -= 1) {
  const volume = 8 + Math.round(5 * Math.sin(day / 2.5)) + (day < 7 ? 7 : 0);
  for (let i = 0; i < volume; i += 1) {
    const ts = now - day * 86400 - (i * 1900) % 70000;
    const utm = i % 4 === 0;
    views.push({
      ts,
      path: paths[(day + i) % paths.length],
      referrer: refs[(day + i) % refs.length],
      us: utm ? "google" : "",
      um: utm ? "cpc" : "",
      uc: utm ? "never-miss" : "",
      device: devices[(day + i) % devices.length],
      visitor: visitors[(day * 3 + i) % visitors.length],
    });
    if (i % 3 === 0) {
      clicks.push({
        ts,
        path: paths[(day + i) % paths.length],
        element: elements[(day + i) % elements.length],
        visitor: visitors[(day + i) % visitors.length],
      });
    }
  }
}

function chunk(rows, size, builder) {
  const sql = [];
  for (let i = 0; i < rows.length; i += size) {
    sql.push(builder(rows.slice(i, i + size)));
  }
  return sql.join("\n");
}

const viewSql = chunk(views, 40, (group) => {
  const values = group.map((row) => `(${row.ts}, ${q(row.path)}, ${q(row.referrer)}, ${q(row.us)}, ${q(row.um)}, ${q(row.uc)}, '', '', ${q(row.device)}, ${q(row.visitor)})`).join(",\n");
  return `INSERT INTO pageviews (ts, path, referrer, utm_source, utm_medium, utm_campaign, utm_content, utm_term, device, visitor) VALUES\n${values};`;
});

const clickSql = chunk(clicks, 40, (group) => {
  const values = group.map((row) => `(${row.ts}, ${q(row.path)}, ${q(row.element)}, ${q(row.visitor)})`).join(",\n");
  return `INSERT INTO clicks (ts, path, element, visitor) VALUES\n${values};`;
});

const sql = `
DELETE FROM pageviews;
DELETE FROM clicks;
DELETE FROM refund_requests;
DELETE FROM change_requests;
DELETE FROM chat_messages;
DELETE FROM intake_submissions;
DELETE FROM hubspot_contacts;
DELETE FROM hubspot_form_submissions;
DELETE FROM hubspot_threads;
DELETE FROM clients;
UPDATE auto_approve_settings SET enabled = 0;

INSERT INTO clients (name, email, go_live_date, first_tracked_customer_at, created_at) VALUES
  ('Summit Air HVAC', 'summit@example.com', date('now', '-10 days'), NULL, strftime('%s','now')),
  ('Riverbend Plumbing', 'river@example.com', date('now', '-45 days'), datetime('now', '-2 days'), strftime('%s','now')),
  ('Eastside Electric', 'east@example.com', date('now', '-40 days'), NULL, strftime('%s','now')),
  ('Northwind Roofing', 'north@example.com', NULL, NULL, strftime('%s','now'));

INSERT INTO refund_requests (client_id, client_name, amount_cents, status, source, created_at)
SELECT id, name, 19700, 'pending', 'demo', strftime('%s','now') FROM clients;

INSERT INTO change_requests (client_id, client_name, request_text, suggestion, preview_url, status, created_at)
SELECT id, name, 'Please show emergency hours on the homepage.', 'Add a line under the phone number: Emergency service, 24 hours.', 'https://example.com/preview/summit-hours', 'pending', strftime('%s','now')
FROM clients WHERE name = 'Summit Air HVAC';

INSERT INTO change_requests (client_id, client_name, request_text, suggestion, preview_url, status, created_at)
SELECT id, name, 'Swap the hero photo for the truck photo.', 'Replace the hero image with the truck in the driveway.', 'https://example.com/preview/eastside-hero', 'pending', strftime('%s','now')
FROM clients WHERE name = 'Eastside Electric';

INSERT INTO intake_submissions (created_at, name, business_name, phone, email, payload_json, hubspot_status) VALUES
  (strftime('%s','now') - 86400, 'Alicia Gomez', 'Summit Air HVAC', '3175550142', 'alicia@example.com', '{"services":"AC repair and install"}', 'demo'),
  (strftime('%s','now') - 3600, 'Chris Patel', 'Riverbend Plumbing', '3175550199', 'chris@example.com', '{"services":"Drain cleaning"}', 'demo');

INSERT INTO hubspot_contacts (id, email, name, phone, company, updated_at, synced_at) VALUES
  ('demo-contact-1', 'alicia@example.com', 'Alicia Gomez', '3175550142', 'Summit Air HVAC', strftime('%s','now'), strftime('%s','now')),
  ('demo-contact-2', 'chris@example.com', 'Chris Patel', '3175550199', 'Riverbend Plumbing', strftime('%s','now'), strftime('%s','now')),
  ('demo-contact-3', 'jamie@example.com', 'Jamie Cole', '3175550110', 'Northwind Roofing', strftime('%s','now'), strftime('%s','now'));

INSERT INTO hubspot_form_submissions (id, form_id, form_name, submitted_at, email, summary, synced_at) VALUES
  ('demo-form-1', 'demo', 'Contact form', strftime('%s','now') - 7200, 'jamie@example.com', 'email: jamie@example.com · message: Need a website', strftime('%s','now')),
  ('demo-form-2', 'demo', 'Contact form', strftime('%s','now') - 18000, 'pat@example.com', 'email: pat@example.com · message: Book a call', strftime('%s','now'));

INSERT INTO chat_messages (created_at, client_id, role, body)
SELECT strftime('%s','now'), id, 'user', 'Demo only: can you move the phone number into the header?'
FROM clients WHERE name = 'Summit Air HVAC';

${viewSql}
${clickSql}
`;

const file = "/tmp/omnix-demo-seed.sql";
writeFileSync(file, sql);
const wrangler = join(root, "node_modules", ".bin", "wrangler");
const result = spawnSync(wrangler, ["d1", "execute", "omnix", "--local", "--file", file], {
  cwd: root,
  stdio: "inherit",
});
if (result.status !== 0) process.exit(result.status || 1);
console.error("Local demo data loaded. This did not touch production.");
