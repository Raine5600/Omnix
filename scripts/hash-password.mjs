#!/usr/bin/env node
/**
 * Build the ADMIN_PASSWORD_HASH secret for the Omnix admin login.
 *
 * Do not pass the password as an argument (it would show up in the process list).
 * Do not commit the hash. Paste it only into the Cloudflare secret.
 *
 *   read -s ADMIN_PASSWORD
 *   export ADMIN_PASSWORD
 *   node scripts/hash-password.mjs
 *   unset ADMIN_PASSWORD
 *
 * Or pipe the password on stdin:
 *   printf '%s' 'your-password' | node scripts/hash-password.mjs
 *
 * Optional: PBKDF2_ITERATIONS (default 100000, minimum 10000).
 * The printed line looks like: pbkdf2$iterations$salt_b64$hash_b64
 * Cloudflare Pages free plan has a short CPU limit. Login is rare, so 100000
 * usually fits. If sign-in returns "Worker exceeded resource limits", run this
 * again with PBKDF2_ITERATIONS=20000 and replace the secret.
 */

import { hashPassword } from "../functions/_lib/password.mjs";

if (process.argv.length > 2) {
  console.error("Do not pass the password as an argument. Set ADMIN_PASSWORD or pipe it on stdin.");
  process.exit(1);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

const password = process.env.ADMIN_PASSWORD || (process.stdin.isTTY ? "" : await readStdin());
if (!password) {
  console.error("Set ADMIN_PASSWORD, or pipe the password on stdin.");
  process.exit(1);
}
if (password.length < 10) {
  console.error("Use at least 10 characters.");
  process.exit(1);
}

const iterations = process.env.PBKDF2_ITERATIONS ? Number(process.env.PBKDF2_ITERATIONS) : 100000;
const line = await hashPassword(password, iterations);
process.stdout.write(`${line}\n`);
