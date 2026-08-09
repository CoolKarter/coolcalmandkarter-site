'use strict';

// A small, dependency-free baseline security-header set — deliberately not
// Helmet. Three static headers plus a Referrer-Policy is not worth a new
// dependency; X-Powered-By is disabled separately via app.disable in
// server.js (an Express app-level setting, not a per-response header, so
// it doesn't belong in this middleware). No CSP here: a wrong CSP can
// silently break Stripe Checkout/fonts/images, which is worse than having
// none yet — revisit once the exact production asset/script origins are
// final.
const REFERRER_POLICY = 'strict-origin-when-cross-origin';

/**
 * Sets a minimal, safe response-header baseline on every request:
 *   X-Content-Type-Options: nosniff       — blocks MIME-sniffing attacks
 *   X-Frame-Options: DENY                 — blocks this site being framed (clickjacking)
 *   Referrer-Policy: strict-origin-when-cross-origin — standard, widely-used
 *     default: full URL on same-origin navigation, origin-only cross-origin,
 *     nothing on a downgrade to plain HTTP. Doesn't break analytics/referral
 *     tracking the way a stricter policy (no-referrer) would.
 */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', REFERRER_POLICY);
  next();
}

module.exports = { securityHeaders, REFERRER_POLICY };
