'use strict';

const { generateSecureToken, hashToken } = require('./secure-token');
const { SESSION_MAX_AGE_MS } = require('./session-cookie');

/**
 * Creates a new customer session for an already-verified email — this is
 * only ever called after a magic-link token has been atomically consumed
 * (see verify-orders-access-token.js). Generates a second, independent
 * random token; only its hash is persisted. The raw token is returned
 * once, for the caller to place in the HttpOnly cookie — it is never
 * stored anywhere in plaintext.
 *
 * `now`/`generateToken` are injectable for deterministic tests.
 */
async function createCustomerSession({ emailNormalized, CustomerSessionModel, now = new Date(), generateToken = generateSecureToken }) {
  const rawToken = generateToken();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_MS);

  await CustomerSessionModel.create({
    sessionTokenHash: hashToken(rawToken),
    emailNormalized,
    createdAt: now,
    expiresAt,
  });

  return { rawToken, expiresAt };
}

/**
 * Authenticates a request from its raw session-cookie value. Hashes the
 * token and looks up a matching, unexpired session — never trusts
 * anything else the client claims. Returns `{ ok: true, emailNormalized }`
 * on success or `{ ok: false }` on any failure (missing token, no
 * matching session, expired session) — the caller responds identically
 * (401) regardless of which; the reason is never distinguished to the
 * client.
 *
 * Sessions are fixed-lifetime, not sliding — authenticating a request
 * never extends `expiresAt`.
 */
async function authenticateCustomerSession({ rawToken, CustomerSessionModel, now = new Date() }) {
  if (!rawToken || typeof rawToken !== 'string') {
    return { ok: false };
  }

  const session = await CustomerSessionModel.findOne({
    sessionTokenHash: hashToken(rawToken),
    expiresAt: { $gt: now },
  });

  if (!session) {
    return { ok: false };
  }

  return { ok: true, emailNormalized: session.emailNormalized };
}

/**
 * Deletes the server-side session matching the given raw token, if any.
 * Idempotent by construction — deleting a session that doesn't exist (a
 * second logout call, an already-expired session) is a normal, successful
 * no-op, not an error.
 */
async function deleteCustomerSession({ rawToken, CustomerSessionModel }) {
  if (!rawToken || typeof rawToken !== 'string') {
    return { deleted: false };
  }

  const result = await CustomerSessionModel.deleteOne({ sessionTokenHash: hashToken(rawToken) });
  return { deleted: (result?.deletedCount || 0) > 0 };
}

module.exports = { createCustomerSession, authenticateCustomerSession, deleteCustomerSession };
