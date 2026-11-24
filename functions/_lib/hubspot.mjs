import { nowSec } from "./http.mjs";
import { pickIntake } from "./intake-validate.mjs";

export const HUBSPOT_PORTAL_ID = "248103970";

function clip(value, max = 180) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function hs(token, path, options = {}) {
  const response = await fetch(`https://api.hubapi.com${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  return { ok: response.ok, status: response.status, payload };
}

function scopeNotice(status, scope) {
  if (status === 401 || status === 403) return `Needs scope ${scope}.`;
  return "";
}

export async function checkPortal(token) {
  const details = await hs(token, "/account-info/v3/details");
  if (!details.ok || !details.payload || details.payload.portalId == null) {
    return { ok: true, skipped: true };
  }
  const portalId = String(details.payload.portalId);
  if (portalId !== HUBSPOT_PORTAL_ID) {
    return { ok: false, notice: `This token is for HubSpot portal ${portalId}. Omnix uses portal ${HUBSPOT_PORTAL_ID}.` };
  }
  return { ok: true, portalId };
}

function contactName(properties) {
  const props = properties || {};
  const name = [props.firstname, props.lastname].filter(Boolean).join(" ").trim();
  return name || props.email || "";
}

function splitName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  if (parts.length === 1) return { firstname: parts[0].slice(0, 80) };
  return {
    firstname: parts[0].slice(0, 80),
    lastname: parts.slice(1).join(" ").slice(0, 80),
  };
}

function intakeNote(record) {
  const labels = {
    name: "Name",
    business_name: "Business",
    phone: "Phone",
    email: "Email",
    logo_link: "Logo link",
    photo_link: "Photo link",
    brand_colors: "Brand colors",
    services: "Services",
    service_area: "Service area",
    hours: "Hours",
    gbp_access: "Google Business Profile",
    domain_name: "Domain",
    domain_access: "Domain access",
    phone_provider: "Phone provider",
    past_customers: "Past customers",
    past_customers_link: "Past customers link",
    open_estimates: "Open estimates",
    open_estimates_link: "Open estimates link",
    stripe_session_id: "Stripe session",
  };
  return Object.entries(labels)
    .filter(([key]) => record[key])
    .map(([key, label]) => `${label}: ${record[key]}`)
    .join("\n")
    .slice(0, 20000);
}

export async function pushIntakeToHubspot(env, record) {
  const token = env && env.HUBSPOT_TOKEN;
  if (!token) return { status: "skipped" };
  try {
    const portal = await checkPortal(token);
    if (!portal.ok) return { status: "error", detail: portal.notice };

    const properties = {
      ...splitName(record.name),
    };
    if (record.email) properties.email = record.email;
    if (record.phone) properties.phone = record.phone;
    if (record.business_name) properties.company = record.business_name.slice(0, 200);

    let contactId = "";
    if (record.email) {
      const search = await hs(token, "/crm/v3/objects/contacts/search", {
        method: "POST",
        body: {
          filterGroups: [{
            filters: [{ propertyName: "email", operator: "EQ", value: record.email }],
          }],
          properties: ["email"],
          limit: 1,
        },
      });
      if (!search.ok) {
        return { status: "error", detail: scopeNotice(search.status, "crm.objects.contacts.read") || `HubSpot contacts returned ${search.status}.` };
      }
      const found = search.payload && search.payload.results && search.payload.results[0];
      if (found) {
        contactId = String(found.id);
        const update = await hs(token, `/crm/v3/objects/contacts/${contactId}`, {
          method: "PATCH",
          body: { properties },
        });
        if (!update.ok) {
          return { status: "error", detail: scopeNotice(update.status, "crm.objects.contacts.write") || `HubSpot contact update returned ${update.status}.` };
        }
      }
    }

    if (!contactId) {
      const created = await hs(token, "/crm/v3/objects/contacts", {
        method: "POST",
        body: { properties },
      });
      if (!created.ok) {
        return { status: "error", detail: scopeNotice(created.status, "crm.objects.contacts.write") || `HubSpot contact create returned ${created.status}.` };
      }
      contactId = String(created.payload.id);
    }

    const subject = `Never Miss a Job intake — ${clip(record.business_name || record.name || "New client", 120)}`;
    const ticketBody = {
      properties: {
        subject,
        content: intakeNote(record) || "Intake submitted from the website.",
        hs_pipeline: "0",
        hs_pipeline_stage: "1",
      },
      associations: contactId ? [{
        to: { id: contactId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 16 }],
      }] : [],
    };
    let ticket = await hs(token, "/crm/v3/objects/tickets", { method: "POST", body: ticketBody });
    if (!ticket.ok) {
      delete ticketBody.properties.hs_pipeline;
      delete ticketBody.properties.hs_pipeline_stage;
      ticket = await hs(token, "/crm/v3/objects/tickets", { method: "POST", body: ticketBody });
    }
    if (!ticket.ok) {
      return {
        status: "error",
        contactId,
        detail: scopeNotice(ticket.status, "crm.objects.tickets.write") || `HubSpot ticket returned ${ticket.status}.`,
      };
    }
    return { status: "ok", contactId, ticketId: String(ticket.payload.id) };
  } catch {
    return { status: "error", detail: "HubSpot could not be reached." };
  }
}

async function replaceRows(db, table, rows, insert) {
  await db.prepare(`DELETE FROM ${table}`).run();
  if (!rows.length) return;
  const statements = rows.map((row) => insert(row));
  if (db.batch) await db.batch(statements);
  else {
    for (const statement of statements) await statement.run();
  }
}

export async function syncHubspot(env) {
  const token = env && env.HUBSPOT_TOKEN;
  const db = env && env.DB;
  if (!db) return { ok: false, error: "Database is not connected." };
  const now = nowSec();
  if (!token) {
    await db.prepare(
      "UPDATE hubspot_sync SET last_error = ?, notices_json = ? WHERE id = 1"
    ).bind("HUBSPOT_TOKEN is not set.", JSON.stringify({
      token: "HubSpot is not connected yet. Set the HUBSPOT_TOKEN secret.",
      conversations: "Needs scope conversations.read.",
    })).run();
    return { ok: false, error: "HUBSPOT_TOKEN is not set." };
  }

  const locked = await db.prepare(
    `UPDATE hubspot_sync SET last_started_at = ?
     WHERE id = 1 AND (last_started_at IS NULL OR last_started_at < ?)`
  ).bind(now, now - 120).run();
  if (!locked.meta || !locked.meta.changes) {
    return { ok: true, skipped: "A sync is already running." };
  }

  const notices = {};
  try {
    const portal = await checkPortal(token);
    if (!portal.ok) {
      notices.portal = portal.notice;
      await db.prepare(
        "UPDATE hubspot_sync SET last_error = ?, notices_json = ?, last_started_at = NULL WHERE id = 1"
      ).bind(portal.notice, JSON.stringify(notices)).run();
      return { ok: false, error: portal.notice };
    }

    const contactsRes = await hs(token, "/crm/v3/objects/contacts?limit=100&properties=email,firstname,lastname,phone,company,lastmodifieddate");
    if (!contactsRes.ok) {
      notices.contacts = scopeNotice(contactsRes.status, "crm.objects.contacts.read") || `Contacts returned ${contactsRes.status}.`;
    } else {
      const results = (contactsRes.payload && contactsRes.payload.results) || [];
      await replaceRows(db, "hubspot_contacts", results, (row) => db.prepare(
        `INSERT INTO hubspot_contacts (id, email, name, phone, company, updated_at, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        String(row.id),
        clip(row.properties && row.properties.email, 200),
        clip(contactName(row.properties), 200),
        clip(row.properties && row.properties.phone, 40),
        clip(row.properties && row.properties.company, 200),
        now,
        now
      ));
    }

    const formsRes = await hs(token, "/marketing/v3/forms/?limit=10");
    const submissions = [];
    if (!formsRes.ok) {
      notices.forms = scopeNotice(formsRes.status, "forms") || `Forms returned ${formsRes.status}.`;
    } else {
      const forms = ((formsRes.payload && formsRes.payload.results) || []).slice(0, 8);
      for (const form of forms) {
        const formId = form.id || form.guid;
        if (!formId) continue;
        const submitted = await hs(token, `/form-integrations/v1/submissions/forms/${encodeURIComponent(formId)}?limit=30`);
        if (!submitted.ok) {
          notices.forms = scopeNotice(submitted.status, "forms") || `Form submissions returned ${submitted.status}.`;
          break;
        }
        const items = (submitted.payload && submitted.payload.results) || [];
        items.forEach((item, index) => {
          const values = item.values || [];
          const email = (values.find((entry) => /email/i.test(entry.name || "")) || {}).value || "";
          const summary = values.slice(0, 4).map((entry) => `${entry.name}: ${entry.value}`).join(" · ");
          submissions.push({
            id: `${formId}-${item.submittedAt || index}-${index}`,
            form_id: String(formId),
            form_name: clip(form.name, 160),
            submitted_at: item.submittedAt ? Math.floor(Number(item.submittedAt) / 1000) : now,
            email: clip(email, 200),
            summary: clip(summary, 300),
          });
        });
      }
      if (!notices.forms) {
        await replaceRows(db, "hubspot_form_submissions", submissions, (row) => db.prepare(
          `INSERT INTO hubspot_form_submissions (id, form_id, form_name, submitted_at, email, summary, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(row.id, row.form_id, row.form_name, row.submitted_at, row.email, row.summary, now));
      }
    }

    const threadsRes = await hs(token, "/conversations/v3/conversations/threads?limit=15");
    if (!threadsRes.ok) {
      notices.conversations = scopeNotice(threadsRes.status, "conversations.read") || `Conversations returned ${threadsRes.status}.`;
      await db.prepare("DELETE FROM hubspot_threads").run();
    } else {
      const threads = ((threadsRes.payload && threadsRes.payload.results) || []).slice(0, 8);
      const stored = [];
      for (const thread of threads) {
        let preview = "";
        const messages = await hs(token, `/conversations/v3/conversations/threads/${encodeURIComponent(thread.id)}/messages?limit=1`);
        if (messages.ok) {
          const first = ((messages.payload && messages.payload.results) || [])[0];
          preview = clip((first && (first.text || first.richText || first.subject)) || "", 180);
        }
        const updated = thread.latestMessageTimestamp
          ? Math.floor(Date.parse(thread.latestMessageTimestamp) / 1000)
          : now;
        stored.push({
          id: String(thread.id),
          status: clip(thread.status, 40),
          preview,
          updated_at: Number.isFinite(updated) ? updated : now,
        });
      }
      await replaceRows(db, "hubspot_threads", stored, (row) => db.prepare(
        `INSERT INTO hubspot_threads (id, status, preview, updated_at, synced_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(row.id, row.status, row.preview, row.updated_at, now));
    }

    if (!notices.conversations) notices.conversations = "";
    await db.prepare(
      `UPDATE hubspot_sync
       SET last_ok_at = ?, last_error = NULL, notices_json = ?, last_started_at = NULL
       WHERE id = 1`
    ).bind(now, JSON.stringify(notices)).run();
    return {
      ok: true,
      contacts: contactsRes.ok ? ((contactsRes.payload && contactsRes.payload.results) || []).length : 0,
      submissions: submissions.length,
      notices,
    };
  } catch (err) {
    console.error("hubspot sync failed");
    await db.prepare(
      "UPDATE hubspot_sync SET last_error = ?, last_started_at = NULL WHERE id = 1"
    ).bind("HubSpot sync failed.").run();
    return { ok: false, error: "HubSpot sync failed." };
  }
}

export async function storeIntake(env, body) {
  const record = pickIntake(body);
  let id = null;
  if (env && env.DB) {
    try {
      const row = await env.DB.prepare(
        `INSERT INTO intake_submissions
           (created_at, name, business_name, phone, email, payload_json, hubspot_status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending') RETURNING id`
      ).bind(
        nowSec(),
        record.name || null,
        record.business_name || null,
        record.phone || null,
        record.email || null,
        JSON.stringify(record)
      ).first();
      id = row && row.id;
    } catch {
      console.error("intake store failed");
    }
  }

  let hubspot = { status: env && env.HUBSPOT_TOKEN ? "pending" : "skipped" };
  if (id && env && env.HUBSPOT_TOKEN) {
    hubspot = await pushIntakeToHubspot(env, record);
    try {
      await env.DB.prepare(
        `UPDATE intake_submissions
         SET hubspot_contact_id = ?, hubspot_ticket_id = ?, hubspot_status = ?
         WHERE id = ?`
      ).bind(
        hubspot.contactId || null,
        hubspot.ticketId || null,
        hubspot.status === "ok" ? "ok" : (hubspot.detail || hubspot.status || "error").slice(0, 180),
        id
      ).run();
    } catch {
      console.error("intake hubspot status failed");
    }
  } else if (id) {
    try {
      await env.DB.prepare(
        "UPDATE intake_submissions SET hubspot_status = 'skipped' WHERE id = ?"
      ).bind(id).run();
    } catch {
      console.error("intake status failed");
    }
  }
  return { ok: true };
}

export async function leadsSnapshot(db, options = {}) {
  const includeDemo = options.demo ? 1 : 0;
  const contacts = await db.prepare(
    `SELECT id, email, name, phone, company, updated_at, is_demo
     FROM hubspot_contacts
     WHERE is_demo = 0 OR ? = 1
     ORDER BY updated_at DESC LIMIT 100`
  ).bind(includeDemo).all();
  const forms = await db.prepare(
    `SELECT id, form_name, submitted_at, email, summary, is_demo
     FROM hubspot_form_submissions
     WHERE is_demo = 0 OR ? = 1
     ORDER BY submitted_at DESC LIMIT 100`
  ).bind(includeDemo).all();
  const intake = await db.prepare(
    `SELECT id, created_at, name, business_name, phone, email, hubspot_status, is_demo
     FROM intake_submissions
     WHERE is_demo = 0 OR ? = 1
     ORDER BY created_at DESC LIMIT 100`
  ).bind(includeDemo).all();
  const sync = await db.prepare(
    "SELECT last_ok_at, last_error, notices_json FROM hubspot_sync WHERE id = 1"
  ).first();
  let notices = {};
  try {
    notices = sync && sync.notices_json ? JSON.parse(sync.notices_json) : {};
  } catch {
    notices = {};
  }
  return {
    contacts: contacts.results || [],
    forms: forms.results || [],
    intake: intake.results || [],
    last_ok_at: sync ? sync.last_ok_at : null,
    last_error: sync ? sync.last_error : null,
    notices,
  };
}

export async function messagesSnapshot(db, env, options = {}) {
  const includeDemo = options.demo ? 1 : 0;
  const threads = await db.prepare(
    `SELECT id, status, preview, updated_at, is_demo FROM hubspot_threads
     WHERE is_demo = 0 OR ? = 1
     ORDER BY updated_at DESC LIMIT 50`
  ).bind(includeDemo).all();
  const chat = await db.prepare(
    `SELECT m.id, m.created_at, m.role, m.body, m.is_demo, c.name AS client_name
     FROM chat_messages m
     LEFT JOIN clients c ON c.id = m.client_id
     WHERE m.is_demo = 0 OR ? = 1
     ORDER BY m.created_at DESC LIMIT 50`
  ).bind(includeDemo).all();
  const sync = await db.prepare("SELECT notices_json, last_error FROM hubspot_sync WHERE id = 1").first();
  let notices = {};
  try {
    notices = sync && sync.notices_json ? JSON.parse(sync.notices_json) : {};
  } catch {
    notices = {};
  }
  const configured = Boolean(env && env.HUBSPOT_TOKEN);
  let conversationsNotice = notices.conversations || "";
  if (!configured) {
    conversationsNotice = "HubSpot is not connected yet. Set the HUBSPOT_TOKEN secret. Conversations need scope conversations.read.";
  } else if (!conversationsNotice && !(threads.results || []).length) {
    conversationsNotice = "";
  }
  return {
    configured,
    conversations_notice: conversationsNotice,
    threads: threads.results || [],
    chat: chat.results || [],
    chat_note: "The website chat is not connected yet. This list is ready for a future AI chat on the site.",
  };
}
