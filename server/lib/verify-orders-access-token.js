'use strict';

const { hashToken } = require('./secure-token');

/**
 * Atomically verifies and consumes a magic-link token in one database
 * operation — this is the critical property that makes the token
 * genuinely one-time-use. Two near-simultaneous requests for the same raw
 * token (e.g. an email client prefetching the link, or a user double-
 * clicking) race on the SAME findOneAndUpdate: MongoDB serializes the two
 * writes, so only the first one still sees `usedAt: null` and wins; the
 * second finds no matching (still-unused) document and gets null back.
 * There is no separate "read, inspect, then write" sequence for a second
 * request to slip through.
 *
 * Expired, already-used, and simply-invalid (unknown hash) tokens all
 * produce the identical `{ ok: false }` result — the caller responds with
 * the same generic failure regardless of which, never revealing why.
 */
async function verifyOrdersAccessToken({ token, OrderAccessTokenModel, now = new Date() }) {
  if (!token || typeof token !== 'string') {
    return { ok: false };
  }

  const tokenHash = hashToken(token);

  const consumed = await OrderAccessTokenModel.findOneAndUpdate(
    { tokenHash, usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { new: true },
  );

  if (!consumed) {
    return { ok: false };
  }

  return { ok: true, emailNormalized: consumed.emailNormalized };
}

module.exports = { verifyOrdersAccessToken };
