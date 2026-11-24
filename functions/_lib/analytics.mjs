import { sha256Hex } from "./bytes.mjs";
import { clientIp, json, nowSec } from "./http.mjs";

const BOT_RE = /bot|spider|crawl|slurp|preview|facebookexternalhit|whatsapp|telegrambot|headless|phantom|wget|curl|python-requests|go-http-client|bytespider|petalbot|semrush|ahrefs|gptbot|claudebot|bingpreview|httpclient/i;
const MAX_BODY = 2048;
const MAX_PER_MINUTE = 40;

export function isBot(userAgent) {
  const ua = String(userAgent || "").trim();
  if (ua.length < 12) return true;
  return BOT_RE.test(ua);
}

export function deviceClass(userAgent) {
  const ua = String(userAgent || "");
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android/i.test(ua)) return "mobile";
  return "desktop";
}

export function cleanPath(value) {
  let path = String(value || "").split("?")[0].split("#")[0].trim();
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 200) path = path.slice(0, 200);
  if (!/^\/[\w\-./]*$/.test(path)) return null;
  if (path.startsWith("/admin") || path.startsWith("/api")) return null;
  return path;
}

export function cleanReferrer(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return `${url.origin}${url.pathname}`.slice(0, 300);
  } catch {
    return "";
  }
}

export function cleanUtm(value) {
  return String(value || "").replace(/[^\w .+\-]/g, "").trim().slice(0, 80);
}

export function cleanElement(value) {
  const element = String(value || "").trim().slice(0, 80);
  if (!/^[a-z0-9:_-]{1,80}$/.test(element)) return null;
  return element;
}

async function dailySalt(db, now) {
  const day = new Date(now * 1000).toISOString().slice(0, 10);
  const existing = await db.prepare("SELECT salt FROM visitor_salts WHERE day = ?").bind(day).first();
  if (existing && existing.salt) return existing.salt;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let salt = "";
  for (let i = 0; i < bytes.length; i++) salt += bytes[i].toString(16).padStart(2, "0");
  await db.prepare("INSERT OR IGNORE INTO visitor_salts (day, salt) VALUES (?, ?)").bind(day, salt).run();
  const row = await db.prepare("SELECT salt FROM visitor_salts WHERE day = ?").bind(day).first();
  return row.salt;
}

export async function visitorHash(ip, userAgent, salt) {
  return sha256Hex(`${ip}\n${userAgent}\n${salt}`);
}

function empty() {
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

export async function recordEvent(request, env) {
  if (request.method !== "POST") return empty();
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY) {
    return json({ error: "That request is too large." }, 413);
  }
  const userAgent = request.headers.get("user-agent") || "";
  if (isBot(userAgent)) return empty();

  let text = "";
  try {
    text = await request.text();
  } catch {
    return empty();
  }
  if (text.length > MAX_BODY) return json({ error: "That request is too large." }, 413);

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return empty();
  }
  if (!body || typeof body !== "object") return empty();

  const path = cleanPath(body.p);
  if (!path) return empty();
  const kind = body.t === "click" ? "click" : body.t === "view" ? "view" : "";
  if (!kind) return empty();
  const element = kind === "click" ? cleanElement(body.e) : null;
  if (kind === "click" && !element) return empty();

  if (!env || !env.DB) return empty();

  try {
    const now = nowSec();
    const salt = await dailySalt(env.DB, now);
    const ip = clientIp(request);
    const visitor = await visitorHash(ip, userAgent, salt);
    const since = now - 60;
    const viewCount = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM pageviews WHERE visitor = ? AND ts >= ?"
    ).bind(visitor, since).first();
    const clickCount = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM clicks WHERE visitor = ? AND ts >= ?"
    ).bind(visitor, since).first();
    if (Number(viewCount && viewCount.n) + Number(clickCount && clickCount.n) >= MAX_PER_MINUTE) {
      return empty();
    }

    const device = deviceClass(userAgent);
    if (kind === "view") {
      await env.DB.prepare(
        `INSERT INTO pageviews (ts, path, referrer, utm_source, utm_medium, utm_campaign, utm_content, utm_term, device, visitor)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        now,
        path,
        cleanReferrer(body.r),
        cleanUtm(body.us),
        cleanUtm(body.um),
        cleanUtm(body.uc),
        cleanUtm(body.ut),
        cleanUtm(body.un),
        device,
        visitor
      ).run();
    } else {
      await env.DB.prepare(
        "INSERT INTO clicks (ts, path, element, visitor) VALUES (?, ?, ?, ?)"
      ).bind(now, path, element, visitor).run();
    }
  } catch (err) {
    console.error("analytics write failed");
  }
  return empty();
}
