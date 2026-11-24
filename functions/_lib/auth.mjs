import { randomHex, sha256Hex, timingSafeEqualStr } from "./bytes.mjs";
import { clientIp, nowSec, readCookie, requestIsSecure, sessionCookie } from "./http.mjs";
import { verifyPassword } from "./password.mjs";

export const SESSION_SECONDS = 12 * 60 * 60;
const LOCK_WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES = 5;
const DEFAULT_EMAIL = "raine5600@gmail.com";

export function adminEmail(env) {
  return String((env && env.ADMIN_EMAIL) || DEFAULT_EMAIL).trim().toLowerCase();
}

export async function ipHash(request) {
  return sha256Hex(`login|${clientIp(request)}`);
}

export async function loginAllowed(db, hash, now = nowSec()) {
  const since = now - LOCK_WINDOW_SECONDS;
  await db.prepare("DELETE FROM login_attempts WHERE ts < ?").bind(since).run();
  const row = await db.prepare(
    "SELECT COUNT(*) AS n FROM login_attempts WHERE ip_hash = ? AND ts >= ?"
  ).bind(hash, since).first();
  return Number(row && row.n) < MAX_FAILURES;
}

export async function recordLoginFailure(db, hash, now = nowSec()) {
  await db.prepare("INSERT INTO login_attempts (ip_hash, ts) VALUES (?, ?)").bind(hash, now).run();
}

export async function createSession(db, now = nowSec()) {
  const token = randomHex(32);
  const csrf = randomHex(32);
  const tokenHash = await sha256Hex(token);
  await db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now).run();
  await db.prepare(
    "INSERT INTO sessions (token_hash, csrf_token, created_at, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(tokenHash, csrf, now, now + SESSION_SECONDS).run();
  return { token, csrf };
}

export async function readSession(db, request, now = nowSec()) {
  const token = readCookie(request, "omnix_session");
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = await sha256Hex(token);
  const row = await db.prepare(
    "SELECT csrf_token, expires_at FROM sessions WHERE token_hash = ?"
  ).bind(tokenHash).first();
  if (!row) return null;
  if (Number(row.expires_at) <= now) {
    await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  return { token, tokenHash, csrf: row.csrf_token };
}

export async function destroySession(db, request) {
  const token = readCookie(request, "omnix_session");
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
}

export function sessionSetCookie(token, request) {
  return sessionCookie(token, { secure: requestIsSecure(request), maxAge: SESSION_SECONDS });
}

export function sessionClearCookie(request) {
  return sessionCookie("", { secure: requestIsSecure(request), maxAge: 0 });
}

export function csrfOk(request, session) {
  const sent = request.headers.get("x-csrf-token") || "";
  if (!session || !session.csrf || !sent) return false;
  return timingSafeEqualStr(sent, session.csrf);
}

export async function checkLogin(env, email, password) {
  const stored = String((env && env.ADMIN_PASSWORD_HASH) || "");
  const emailOk = timingSafeEqualStr(String(email || "").trim().toLowerCase(), adminEmail(env));
  const passOk = await verifyPassword(String(password || "").slice(0, 200), stored);
  return emailOk && passOk;
}
