'use strict';

const { generateSecureToken, hashToken } = require('./secure-token');

// An administration session, deliberately shorter-lived than the 14-day
// customer My Orders session (customer-session.js) — 8 hours, fixed, not
// extended by activity. Same one-way-hash-only storage pattern: only
// sessionTokenHash/createdAt/expiresAt are ever persisted (see server.js's
// adminSessionSchema) — never the raw token, never a username/password.
const ADMIN_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

/**
 * Creates a new admin session after a successful password check (see
 * admin-credentials.js). Generates an independent random token; only its
 * hash is persisted. The raw token is returned once, for the caller to
 * place in the HttpOnly admin-session cookie — it is never stored, never
 * logged.
 */
async function createAdminSession({ AdminSessionModel, now = new Date(), generateToken = generateSecureToken }) {
  const rawToken = generateToken();
  const expiresAt = new Date(now.getTime() + ADMIN_SESSION_MAX_AGE_MS);

  await AdminSessionModel.create({
    sessionTokenHash: hashToken(rawToken),
    createdAt: now,
    expiresAt,
  });

  return { rawToken, expiresAt };
}

/**
 * Authenticates a request from its raw admin-session-cookie value. Returns
 * `{ ok: true }` for a matching, unexpired session or `{ ok: false }` for
 * any failure (missing token, no match, expired) — the caller responds
 * identically (401 JSON, no WWW-Authenticate) regardless of which reason.
 * Fixed-lifetime, not sliding — authenticating never extends expiresAt.
 */
async function authenticateAdminSession({ rawToken, AdminSessionModel, now = new Date() }) {
  if (!rawToken || typeof rawToken !== 'string') {
    return { ok: false };
  }

  const session = await AdminSessionModel.findOne({
    sessionTokenHash: hashToken(rawToken),
    expiresAt: { $gt: now },
  });

  return session ? { ok: true } : { ok: false };
}

/**
 * Deletes the server-side admin session matching the given raw token, if
 * any. Idempotent — deleting a session that doesn't exist (a second
 * logout, an already-expired session) is a normal successful no-op.
 */
async function deleteAdminSession({ rawToken, AdminSessionModel }) {
  if (!rawToken || typeof rawToken !== 'string') {
    return { deleted: false };
  }

  const result = await AdminSessionModel.deleteOne({ sessionTokenHash: hashToken(rawToken) });
  return { deleted: (result?.deletedCount || 0) > 0 };
}

module.exports = {
  ADMIN_SESSION_MAX_AGE_MS,
  createAdminSession,
  authenticateAdminSession,
  deleteAdminSession,
};
