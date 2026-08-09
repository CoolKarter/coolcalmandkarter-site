'use strict';

// Same pattern as orders-access-rate-limit.js/contact-rate-limit.js.
// POST /api/newsletter sends a real Resend welcome email (and an admin
// notification, if configured) on every genuinely-new signup, with no
// other abuse protection beyond the unique-email duplicate check. Slightly
// more generous than the contact form's limit since a real household could
// plausibly attempt a few signups (typo, then retry) faster than a contact
// message would be re-sent.
const NEWSLETTER_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const NEWSLETTER_RATE_LIMIT_MAX = 10; // per IP, per window

module.exports = { NEWSLETTER_RATE_LIMIT_WINDOW_MS, NEWSLETTER_RATE_LIMIT_MAX };
