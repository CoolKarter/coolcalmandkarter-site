'use strict';

/**
 * Global storefront checkout kill-switch — separate from, and layered on
 * top of, the existing per-book `checkoutEnabled` catalog flag (see
 * lib/checkout-catalog.js). `checkoutEnabled` controls whether an
 * INDIVIDUAL book is purchasable; this controls whether the STORE AS A
 * WHOLE is currently selling anything at all (e.g. all 12 physical books
 * temporarily out of stock) — without needing to edit all 12 content
 * files to communicate a temporary, store-wide state.
 *
 * Fails closed, deliberately strict: only the exact string "true" enables
 * checkout. A missing variable, an empty string, or any near-miss value
 * ("TRUE", "1", "yes", " true") all disable it. This is a production
 * commerce safety switch — an absent or misconfigured environment
 * variable must never silently enable real purchasing.
 */
function isStoreCheckoutEnabled(rawValue) {
  return rawValue === 'true';
}

module.exports = { isStoreCheckoutEnabled };
