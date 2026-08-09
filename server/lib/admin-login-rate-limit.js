// Extracted as plain constants (same pattern as
// orders-access-rate-limit.js) so the configured numbers are testable
// without a running Express server. skipSuccessfulRequests is what makes
// this "5 FAILED attempts per 15 minutes" rather than 5 attempts total —
// a legitimately logged-in admin re-checking the dashboard repeatedly
// never burns down their own limit.
'use strict';

const ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const ADMIN_LOGIN_RATE_LIMIT_MAX = 5; // failed attempts, per IP, per window

module.exports = { ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS, ADMIN_LOGIN_RATE_LIMIT_MAX };
