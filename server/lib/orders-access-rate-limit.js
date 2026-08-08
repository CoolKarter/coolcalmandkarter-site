'use strict';

// Extracted as plain constants (rather than inline in server.js's
// express-rate-limit() call) purely so the configured numbers themselves
// are testable without spinning up a running Express server — the actual
// rate-limiting behavior (counting/blocking requests) is express-rate-
// limit's own well-tested job, not something this codebase needs to
// re-verify.
const ORDERS_ACCESS_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const ORDERS_ACCESS_RATE_LIMIT_MAX = 5; // per IP, per window

module.exports = { ORDERS_ACCESS_RATE_LIMIT_WINDOW_MS, ORDERS_ACCESS_RATE_LIMIT_MAX };
