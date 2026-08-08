'use strict';

const crypto = require('crypto');

// Shared by the magic-link token (OrderAccessToken) and the customer
// session token (CustomerSession) — same generation/hashing primitives,
// two independent secrets. The magic-link token is never itself the
// long-lived session credential; a fresh, independent token is generated
// at session-creation time (see customer-session.js).

/** 256 bits of cryptographically secure randomness, hex-encoded (64 chars). */
function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * SHA-256 hash of a raw token, hex-encoded. Only this hash is ever
 * persisted to MongoDB — the raw token exists only transiently (in the
 * email/URL fragment for the magic-link token, in the HttpOnly cookie for
 * the session token) and is never stored, never logged.
 */
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

module.exports = { generateSecureToken, hashToken };
