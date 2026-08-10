'use strict';

// Phase 14C1B — the startup DECISION (connect first, only then listen; on
// failure, fail cleanly and never listen) extracted into its own tiny,
// fully dependency-injected module. It knows nothing about Mongoose,
// Express, or server.js — `connect`/`listen`/`onConnectionError` are all
// injected — specifically so it can be unit-tested (see
// test/start-server.test.js) with fake functions and zero real network,
// database, or HTTP-listening side effects. server.js can't be required
// directly in a test process (it has real side effects — a genuine
// mongoose.connect() call, ~15 app.get/app.post registrations, and
// previously a bare app.listen() — at module-load time); this file is
// deliberately the opposite of that, so it's the one piece of the startup
// sequence that IS directly testable.

/**
 * Runs the startup sequence: await the initial database connection, and
 * only start listening for HTTP requests if that succeeds. This is the
 * fix for a real staging bug (Phase 14C1) where the server began
 * accepting requests immediately, before its MongoDB connection had
 * necessarily finished — a request needing the database during that
 * window could sit in Mongoose's internal query buffer for its default
 * ~10s timeout before failing with an error indistinguishable from a
 * genuine application bug.
 *
 * On a connection failure, this deliberately does NOT retry — a single
 * attempt only. Retrying here would risk an unbounded reconnect loop in
 * application code; that's Mongoose's own driver-level retry behavior
 * and/or the hosting platform's restart-on-crash behavior to own, not
 * this function's. `onConnectionError` is responsible for logging safely
 * (never the raw error, which for a MongoDB connection failure can
 * contain the connection string/credentials) and signaling failure to
 * the caller — this function does not call `process.exit()` itself,
 * leaving that decision to the caller (see server.js).
 *
 * @param {object} deps
 * @param {() => Promise<unknown>} deps.connect - Attempts the initial
 *   database connection. Resolves on success, rejects on failure.
 * @param {() => void} deps.listen - Starts accepting HTTP requests.
 *   Called only after `connect()` resolves.
 * @param {(err: unknown) => void} deps.onConnectionError - Called instead
 *   of `listen()` if `connect()` rejects. Never receives anything this
 *   function adds beyond the original rejection reason.
 * @returns {Promise<{ started: boolean }>}
 */
async function startServer({ connect, listen, onConnectionError }) {
  try {
    await connect();
  } catch (err) {
    onConnectionError(err);
    return { started: false };
  }

  listen();
  return { started: true };
}

module.exports = { startServer };
