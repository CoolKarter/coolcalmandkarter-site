'use strict';

// Same pattern as orders-access-rate-limit.js — extracted as plain
// constants so the configured numbers are testable without a running
// Express server. POST /api/contact sends a real Resend email on every
// request with no other abuse protection (no auth, minimal validation),
// so it gets the same IP-scoped treatment as the magic-link request route.
// 8/15min is the middle of the "5-10" range called for: generous enough
// for a real visitor who mistypes and resubmits, small enough to bound a
// scripted flood of ADMIN_EMAIL/Resend send volume.
const CONTACT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const CONTACT_RATE_LIMIT_MAX = 8; // per IP, per window

module.exports = { CONTACT_RATE_LIMIT_WINDOW_MS, CONTACT_RATE_LIMIT_MAX };
