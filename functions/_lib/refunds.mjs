import { HttpError, nowSec } from "./http.mjs";

export const REFUND_CENTS = 19700;
export const REFUND_AMOUNT_LABEL = "$197.00";
export const REFUND_AMOUNT_NOTE = "First month only. The setup fee and pass-through usage costs are not refundable.";

export const CHANGE_TYPES = [
  ["website_copy", "Website copy"],
  ["hours", "Hours"],
  ["photos", "Photos"],
  ["service_area", "Service area"],
  ["other", "Other"],
];

const REFUND_NAMES = new Set(["refund", "refunds", "refund_request", "refund_requests"]);

export function assertRefundNotAutoApproved(changeType) {
  if (REFUND_NAMES.has(String(changeType || "").trim().toLowerCase())) {
    throw new HttpError(400, "Refunds are never auto-approved.");
  }
}

// Stored toggles are ignored on purpose. Nothing is auto-approved yet.
export function shouldAutoApprove() {
  return false;
}

export function daysSinceGoLive(goLiveDate, now = new Date()) {
  if (!goLiveDate) return null;
  const raw = String(goLiveDate).trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw;
  const start = Date.parse(iso);
  if (Number.isNaN(start)) return null;
  return Math.floor((now.getTime() - start) / 86400000);
}

export function refundFlags(row, now = new Date()) {
  const days = daysSinceGoLive(row && row.go_live_date, now);
  const hasCustomer = Boolean(row && row.first_tracked_customer_at);
  const reasons = [];
  if (days === null) {
    reasons.push("Go-live date is not set, so the 30 days cannot be counted. Go-live means every purchased service is live.");
  } else if (days < 30) {
    const noun = Math.abs(days) === 1 ? "day" : "days";
    reasons.push(`Only ${days} ${noun} since all purchased services went live. The first-month refund waits until day 30.`);
  }
  if (hasCustomer) reasons.push("A tracked paying customer has come through.");
  return {
    days,
    hasCustomer,
    flagged: reasons.length > 0,
    reasons,
    amountCents: REFUND_CENTS,
  };
}

function cleanDate(value) {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new HttpError(400, "Go-live date must look like YYYY-MM-DD.");
  }
  return raw;
}

function cleanTimestamp(value) {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  if (Number.isNaN(Date.parse(raw))) {
    throw new HttpError(400, "The tracked-customer time is not a date.");
  }
  return raw.slice(0, 40);
}

export function presentRefund(row, now = new Date()) {
  const flags = refundFlags(row, now);
  return {
    kind: "refund",
    id: row.id,
    client_name: row.client_name,
    go_live_date: row.go_live_date || null,
    days_since_go_live: flags.days,
    tracked_customer: flags.hasCustomer,
    first_tracked_customer_at: row.first_tracked_customer_at || null,
    amount_cents: REFUND_CENTS,
    amount_label: REFUND_AMOUNT_LABEL,
    amount_note: REFUND_AMOUNT_NOTE,
    flagged: flags.flagged,
    reasons: flags.reasons,
    status: row.status,
    note: row.note || "",
    decided_at: row.decided_at || null,
    created_at: row.created_at,
    source: row.source || "api",
    sample: Number(row.is_demo) === 1,
  };
}

export function presentChange(row) {
  return {
    kind: "change",
    id: row.id,
    client_name: row.client_name,
    request_text: row.request_text,
    suggestion: row.suggestion || "",
    preview_url: row.preview_url || "",
    status: row.status,
    note: row.note || "",
    decided_at: row.decided_at || null,
    created_at: row.created_at,
    sample: Number(row.is_demo) === 1,
  };
}

export async function listQueue(db, now = new Date(), options = {}) {
  const includeDemo = options.demo ? 1 : 0;
  const changes = await db.prepare(
    `SELECT id, client_name, request_text, suggestion, preview_url, status, note, decided_at, created_at, is_demo
     FROM change_requests
     WHERE is_demo = 0 OR ? = 1
     ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC
     LIMIT 100`
  ).bind(includeDemo).all();
  const refunds = await db.prepare(
    `SELECT r.id, r.client_name, r.amount_cents, r.status, r.note, r.decided_at, r.created_at, r.source, r.is_demo,
            c.go_live_date, c.first_tracked_customer_at
     FROM refund_requests r
     LEFT JOIN clients c ON c.id = r.client_id
     WHERE r.is_demo = 0 OR ? = 1
     ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC
     LIMIT 100`
  ).bind(includeDemo).all();
  const settings = await db.prepare(
    "SELECT change_type, enabled FROM auto_approve_settings ORDER BY change_type"
  ).all();
  return {
    changes: (changes.results || []).map(presentChange),
    refunds: (refunds.results || []).map((row) => presentRefund(row, now)),
    auto_approve: (settings.results || []).map((row) => ({
      change_type: row.change_type,
      label: (CHANGE_TYPES.find(([id]) => id === row.change_type) || [row.change_type, row.change_type])[1],
      enabled: Number(row.enabled) === 1,
      applied: false,
    })),
  };
}

export async function createRefundRequest(db, body, now = nowSec()) {
  const name = String((body && body.client_name) || "").trim().slice(0, 200);
  const email = String((body && body.email) || "").trim().slice(0, 200);
  let clientId = Number(body && body.client_id);
  if (!Number.isInteger(clientId) || clientId <= 0) clientId = null;

  let client = null;
  if (clientId) {
    client = await db.prepare("SELECT id, name FROM clients WHERE id = ?").bind(clientId).first();
    if (!client) throw new HttpError(404, "That client was not found.");
  } else if (email) {
    client = await db.prepare("SELECT id, name FROM clients WHERE lower(email) = lower(?)").bind(email).first();
  } else if (name) {
    client = await db.prepare("SELECT id, name FROM clients WHERE name = ?").bind(name).first();
  }
  if (!client && !name && !email) throw new HttpError(400, "Add a client.");

  const hasGoLive = body && Object.prototype.hasOwnProperty.call(body, "go_live_date");
  const hasTracked = body && Object.prototype.hasOwnProperty.call(body, "first_tracked_customer_at");
  const goLive = hasGoLive ? cleanDate(body.go_live_date) : null;
  const tracked = hasTracked ? cleanTimestamp(body.first_tracked_customer_at) : null;

  if (!client) {
    const created = await db.prepare(
      `INSERT INTO clients (name, email, go_live_date, first_tracked_customer_at, created_at)
       VALUES (?, ?, ?, ?, ?) RETURNING id, name`
    ).bind(name || email, email || null, goLive, tracked, now).first();
    client = created;
  } else {
    if (hasGoLive) {
      await db.prepare("UPDATE clients SET go_live_date = ? WHERE id = ?").bind(goLive, client.id).run();
    }
    if (hasTracked) {
      await db.prepare("UPDATE clients SET first_tracked_customer_at = ? WHERE id = ?").bind(tracked, client.id).run();
    }
  }

  const row = await db.prepare(
    `INSERT INTO refund_requests (client_id, client_name, amount_cents, status, source, created_at)
     VALUES (?, ?, ?, 'pending', 'api', ?) RETURNING id`
  ).bind(client.id, client.name || name || email, REFUND_CENTS, now).first();
  return { id: row.id, amount_cents: REFUND_CENTS, stripe: "not_called" };
}

export async function decideRequest(db, kind, id, body, options = {}) {
  const now = options.now || nowSec();
  const allowDemo = Boolean(options.allowDemo);
  if (kind !== "change" && kind !== "refund") throw new HttpError(404, "Unknown queue item.");
  const status = body && body.status;
  if (status !== "approved" && status !== "rejected") {
    throw new HttpError(400, "Choose approve or reject.");
  }
  const note = String((body && body.note) || "").trim().slice(0, 2000);
  const table = kind === "refund" ? "refund_requests" : "change_requests";
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) throw new HttpError(404, "Unknown queue item.");
  const existing = await db.prepare(`SELECT is_demo FROM ${table} WHERE id = ?`).bind(numericId).first();
  if (!existing) throw new HttpError(404, "Unknown queue item.");
  if (Number(existing.is_demo) === 1 && !allowDemo) {
    throw new HttpError(404, "Unknown queue item.");
  }
  const row = await db.prepare(
    `UPDATE ${table} SET status = ?, note = ?, decided_at = ? WHERE id = ? AND status = 'pending' RETURNING id`
  ).bind(status, note || null, now, numericId).first();
  if (!row) throw new HttpError(409, "That item is not waiting for a decision.");
  if (kind === "refund") {
    return {
      ok: true,
      status,
      stripe: "not_called",
      message: "Recorded. No refund was sent to Stripe.",
    };
  }
  return { ok: true, status, message: "Recorded." };
}

export async function saveAutoApprove(db, body) {
  const changeType = String((body && body.change_type) || "");
  assertRefundNotAutoApproved(changeType);
  if (!CHANGE_TYPES.some(([id]) => id === changeType)) {
    throw new HttpError(400, "Unknown change type.");
  }
  const enabled = body && body.enabled ? 1 : 0;
  await db.prepare(
    "UPDATE auto_approve_settings SET enabled = ? WHERE change_type = ?"
  ).bind(enabled, changeType).run();
  return {
    ok: true,
    change_type: changeType,
    enabled: enabled === 1,
    applied: shouldAutoApprove(),
    message: "Saved. Auto-approve does not approve anything yet.",
  };
}
