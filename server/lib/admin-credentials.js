'use strict';

const crypto = require('crypto');

const ADMIN_USERNAME = 'admin';

/**
 * Constant-time string comparison. crypto.timingSafeEqual() throws on
 * differing buffer lengths, so both inputs are first reduced to a
 * fixed-length SHA-256 digest — this avoids ever branching on the raw
 * input length (which would itself leak timing information) while still
 * using a true constant-time primitive for the actual comparison.
 */
function safeStringEqual(a, b) {
  const bufA = crypto.createHash('sha256').update(String(a)).digest();
  const bufB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Validates admin login credentials against the fixed "admin" username and
 * the ADMIN_PASSWORD environment variable (injectable as `adminPassword`
 * for tests). Fails CLOSED — returns `{ ok: false, configError: true }`,
 * never authenticates — if ADMIN_PASSWORD is missing/empty, rather than
 * comparing against `undefined` and risking a thrown error. That thrown
 * error is exactly what produced the raw Express stack trace seen during
 * the Phase 13E staging smoke test when ADMIN_PASSWORD hadn't been
 * configured yet; the caller (the login route) is responsible for turning
 * `configError: true` into a generic response and a server-side-only log
 * line, never a stack trace to the client.
 *
 * Never logs or returns the submitted password, on any path.
 */
function verifyAdminCredentials({ username, password, adminPassword = process.env.ADMIN_PASSWORD }) {
  if (!adminPassword || typeof adminPassword !== 'string') {
    return { ok: false, configError: true };
  }
  if (typeof username !== 'string' || typeof password !== 'string') {
    return { ok: false };
  }

  const usernameMatches = safeStringEqual(username, ADMIN_USERNAME);
  const passwordMatches = safeStringEqual(password, adminPassword);

  return { ok: usernameMatches && passwordMatches };
}

module.exports = { verifyAdminCredentials, safeStringEqual, ADMIN_USERNAME };
