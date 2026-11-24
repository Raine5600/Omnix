import { b64ToBytes, bytesToB64, timingSafeEqual } from "./bytes.mjs";

export const DEFAULT_ITERATIONS = 100000;
const MIN_ITERATIONS = 10000;
const MAX_ITERATIONS = 2000000;

export async function pbkdf2Sha256(password, saltBytes, iterations) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(password)),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations },
    key,
    256
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password, iterations = DEFAULT_ITERATIONS) {
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new Error("Iterations must be an integer from 10000 to 2000000.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2Sha256(password, salt, iterations);
  return `pbkdf2$${iterations}$${bytesToB64(salt)}$${bytesToB64(hash)}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) return false;
  let salt;
  let expected;
  try {
    salt = b64ToBytes(parts[2]);
    expected = b64ToBytes(parts[3]);
  } catch {
    return false;
  }
  if (salt.length < 8 || expected.length !== 32) return false;
  const actual = await pbkdf2Sha256(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}
