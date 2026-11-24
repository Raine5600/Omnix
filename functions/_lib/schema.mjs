import { nowSec } from "./http.mjs";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    csrf_token TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_hash TEXT NOT NULL,
    ts INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts (ip_hash, ts)`,
  `CREATE TABLE IF NOT EXISTS visitor_salts (
    day TEXT PRIMARY KEY,
    salt TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS pageviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    path TEXT NOT NULL,
    referrer TEXT NOT NULL DEFAULT '',
    utm_source TEXT NOT NULL DEFAULT '',
    utm_medium TEXT NOT NULL DEFAULT '',
    utm_campaign TEXT NOT NULL DEFAULT '',
    utm_content TEXT NOT NULL DEFAULT '',
    utm_term TEXT NOT NULL DEFAULT '',
    device TEXT NOT NULL DEFAULT 'desktop',
    visitor TEXT NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pageviews_ts ON pageviews (ts)`,
  `CREATE INDEX IF NOT EXISTS idx_pageviews_visitor ON pageviews (visitor, ts)`,
  `CREATE TABLE IF NOT EXISTS clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    path TEXT NOT NULL,
    element TEXT NOT NULL,
    visitor TEXT NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_clicks_ts ON clicks (ts)`,
  `CREATE INDEX IF NOT EXISTS idx_clicks_visitor ON clicks (visitor, ts)`,
  `CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    hubspot_id TEXT,
    go_live_date TEXT,
    first_tracked_customer_at TEXT,
    created_at INTEGER NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS change_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    client_name TEXT NOT NULL,
    request_text TEXT NOT NULL,
    suggestion TEXT,
    preview_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT,
    decided_at INTEGER,
    created_at INTEGER NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS refund_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    client_name TEXT NOT NULL,
    package_id TEXT NOT NULL DEFAULT 'never-miss-a-job',
    amount_cents INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT,
    decided_at INTEGER,
    created_at INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'api',
    is_demo INTEGER NOT NULL DEFAULT 0,
    CHECK (
      (package_id = 'custom-ai' AND amount_cents IS NULL)
      OR (package_id = 'never-miss-a-job' AND amount_cents = 19700)
      OR (package_id = 'answer-the-call' AND amount_cents = 9700)
    )
  )`,
  `CREATE TABLE IF NOT EXISTS auto_approve_settings (
    change_type TEXT PRIMARY KEY CHECK (change_type <> 'refund'),
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1))
  )`,
  `INSERT OR IGNORE INTO auto_approve_settings (change_type, enabled) VALUES
    ('website_copy', 0),
    ('hours', 0),
    ('photos', 0),
    ('service_area', 0),
    ('other', 0)`,
  `CREATE TABLE IF NOT EXISTS intake_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    name TEXT,
    business_name TEXT,
    phone TEXT,
    email TEXT,
    payload_json TEXT NOT NULL,
    hubspot_contact_id TEXT,
    hubspot_ticket_id TEXT,
    hubspot_status TEXT NOT NULL DEFAULT 'pending',
    is_demo INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS hubspot_contacts (
    id TEXT PRIMARY KEY,
    email TEXT,
    name TEXT,
    phone TEXT,
    company TEXT,
    updated_at INTEGER,
    synced_at INTEGER NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS hubspot_form_submissions (
    id TEXT PRIMARY KEY,
    form_id TEXT,
    form_name TEXT,
    submitted_at INTEGER,
    email TEXT,
    summary TEXT,
    synced_at INTEGER NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS hubspot_threads (
    id TEXT PRIMARY KEY,
    status TEXT,
    preview TEXT,
    updated_at INTEGER,
    synced_at INTEGER NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS hubspot_sync (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_started_at INTEGER,
    last_ok_at INTEGER,
    last_error TEXT,
    notices_json TEXT
  )`,
  `INSERT OR IGNORE INTO hubspot_sync (id) VALUES (1)`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    client_id INTEGER,
    role TEXT NOT NULL,
    body TEXT NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0
  )`,
];

let ready = null;

async function apply(db) {
  for (const sql of STATEMENTS) {
    await db.prepare(sql).run();
  }
  await db.prepare(
    "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES ('0001', ?)"
  ).bind(nowSec()).run();
  try {
    await db.prepare("ALTER TABLE refund_requests ADD COLUMN package_id TEXT NOT NULL DEFAULT 'never-miss-a-job'").run();
  } catch {
    // The column is already there.
  }
}

export function ensureSchema(db) {
  if (!db) return Promise.resolve();
  if (!ready) {
    ready = apply(db).catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}
