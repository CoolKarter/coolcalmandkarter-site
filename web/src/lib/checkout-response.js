// Validates a /api/checkout/session response before the browser is ever
// redirected there. A malformed or unexpected response (misconfigured
// backend, wrong content-type, etc.) must never trigger a redirect to an
// arbitrary URL — only a well-formed, HTTPS, stripe.com-hosted Checkout
// URL is accepted.
//
// Plain JS (not TypeScript) and framework-free on purpose, so it can be
// unit tested directly with Node's built-in test runner without adding
// any new tooling to this project — see web/test/checkout-response.test.js.

export function extractCheckoutUrl(responseBody) {
  if (!responseBody || typeof responseBody !== 'object') {
    return null;
  }

  const { url } = responseBody;
  if (typeof url !== 'string' || url.trim() === '') {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') {
    return null;
  }

  // Stripe-hosted Checkout pages are always served from a stripe.com
  // subdomain (typically checkout.stripe.com) — a cheap extra guard
  // against ever redirecting somewhere unexpected.
  if (parsed.hostname !== 'stripe.com' && !parsed.hostname.endsWith('.stripe.com')) {
    return null;
  }

  return parsed.href;
}
