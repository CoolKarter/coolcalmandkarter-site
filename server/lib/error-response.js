'use strict';

// Central classification for the final Express error-handling middleware
// (see server.js — this is the last app.use() in the stack). Every branch
// returns a fixed, generic body — never err.message, err.stack, or any
// Mongo/Stripe/Resend/Twilio-specific field. Real detail belongs only in
// the server-side console.error() the caller does alongside this, never
// in what gets sent to the client.

/**
 * True for the exact error express.json()/body-parser throws on a
 * malformed JSON request body — verified empirically against this
 * project's actual Express 5 dependency: `err.type === 'entity.parse.failed'`,
 * `err instanceof SyntaxError`, `err.status === 400`. Checking `.type`
 * first (the most specific, intentional signal body-parser sets) with the
 * SyntaxError check as a secondary guard against a false match on some
 * unrelated error that happens to reuse the same `.type` string.
 */
function isJsonParseError(err) {
  return Boolean(err) && err.type === 'entity.parse.failed' && err instanceof SyntaxError;
}

/**
 * Classifies any error reaching the final error-handling middleware into a
 * safe `{ status, body }` response. A malformed JSON body is the one case
 * with its own clear, actionable 400 — everything else (a genuine bug, a
 * Mongo/Stripe/Resend/Twilio failure, a CORS rejection, a missing
 * ADMIN_PASSWORD reaching this far, anything) collapses to a single
 * generic 500, deliberately never distinguishing *what* broke in the
 * response itself — that distinction is for the server log, not the
 * client.
 */
function buildErrorResponse(err) {
  if (isJsonParseError(err)) {
    return { status: 400, body: { error: 'Invalid request body.' } };
  }
  return { status: 500, body: { error: 'Something went wrong. Please try again later.' } };
}

module.exports = { buildErrorResponse, isJsonParseError };
