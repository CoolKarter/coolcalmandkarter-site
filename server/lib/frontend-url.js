'use strict';

/** Strips any trailing slash(es) so callers can safely append a leading-slash path. */
function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, '');
}

/**
 * Builds the Stripe success/cancel redirect URLs from FRONTEND_BASE_URL.
 * Deliberately has no hardcoded fallback to any specific site (staging or
 * production) — every environment must configure its own base URL, so a
 * misconfigured deploy fails loudly instead of silently redirecting to the
 * wrong site.
 */
function buildCheckoutRedirectUrls(env = process.env) {
  const raw = env.FRONTEND_BASE_URL;

  if (!raw || typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, error: 'FRONTEND_BASE_URL is not configured.' };
  }

  const base = normalizeBaseUrl(raw.trim());

  return {
    ok: true,
    successUrl: `${base}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}/cancel`,
  };
}

module.exports = { normalizeBaseUrl, buildCheckoutRedirectUrls };
