-- The live site creates these tables on the first request
-- (functions/_lib/schema.mjs). You do not run this file.
-- It is here so the table list is in the repo.

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  csrf_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX idx_login_attempts_ip ON login_attempts (ip_hash, ts);

CREATE TABLE visitor_salts (
  day TEXT PRIMARY KEY,
  salt TEXT NOT NULL
);

CREATE TABLE pageviews (
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
  visitor TEXT NOT NULL
);
CREATE INDEX idx_pageviews_ts ON pageviews (ts);
CREATE INDEX idx_pageviews_visitor ON pageviews (visitor, ts);

CREATE TABLE clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  path TEXT NOT NULL,
  element TEXT NOT NULL,
  visitor TEXT NOT NULL
);
CREATE INDEX idx_clicks_ts ON clicks (ts);
CREATE INDEX idx_clicks_visitor ON clicks (visitor, ts);

CREATE TABLE clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  hubspot_id TEXT,
  go_live_date TEXT,
  first_tracked_customer_at TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE change_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER,
  client_name TEXT NOT NULL,
  request_text TEXT NOT NULL,
  suggestion TEXT,
  preview_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  note TEXT,
  decided_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE refund_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER,
  client_name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 19700 CHECK (amount_cents = 19700),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  note TEXT,
  decided_at INTEGER,
  created_at INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'api',
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE auto_approve_settings (
  change_type TEXT PRIMARY KEY CHECK (change_type <> 'refund'),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1))
);

INSERT INTO auto_approve_settings (change_type, enabled) VALUES
  ('website_copy', 0),
  ('hours', 0),
  ('photos', 0),
  ('service_area', 0),
  ('other', 0);

CREATE TABLE intake_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  name TEXT,
  business_name TEXT,
  phone TEXT,
  email TEXT,
  payload_json TEXT NOT NULL,
  hubspot_contact_id TEXT,
  hubspot_ticket_id TEXT,
  hubspot_status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE hubspot_contacts (
  id TEXT PRIMARY KEY,
  email TEXT,
  name TEXT,
  phone TEXT,
  company TEXT,
  updated_at INTEGER,
  synced_at INTEGER NOT NULL
);

CREATE TABLE hubspot_form_submissions (
  id TEXT PRIMARY KEY,
  form_id TEXT,
  form_name TEXT,
  submitted_at INTEGER,
  email TEXT,
  summary TEXT,
  synced_at INTEGER NOT NULL
);

CREATE TABLE hubspot_threads (
  id TEXT PRIMARY KEY,
  status TEXT,
  preview TEXT,
  updated_at INTEGER,
  synced_at INTEGER NOT NULL
);

CREATE TABLE hubspot_sync (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_started_at INTEGER,
  last_ok_at INTEGER,
  last_error TEXT,
  notices_json TEXT
);
INSERT INTO hubspot_sync (id) VALUES (1);

CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  client_id INTEGER,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  body TEXT NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);
