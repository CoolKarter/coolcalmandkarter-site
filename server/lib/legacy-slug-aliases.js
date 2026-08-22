'use strict';

// Legacy catalog slug aliases — maps a book's OLD slug (before a
// permanent title/URL rename) to its current canonical slug, so a stale
// checkout request using the old identifier (e.g. from a customer's
// browser cart saved before the rename) still resolves to the right
// product instead of failing with "Unknown product".
//
// Must be kept in sync with web/src/lib/legacy-slug-aliases.js (the
// frontend's identical copy, used to migrate old localStorage cart
// entries) — the two projects don't share code (see
// lib/checkout-catalog.js's slug-matching note), so each maintains its
// own copy of this same static mapping.
//
// Add an entry here only for a genuine, permanent catalog rename — this
// is not a general redirect mechanism, and it never changes which Stripe
// Price ID a resolved product uses (see lib/checkout-catalog.js —
// priceEnvVar is keyed by the CURRENT canonical slug only).
const LEGACY_SLUG_ALIASES = {
  'florida-beach-and-baby': 'beach-and-baby',
  'black-beautiful-and-baby': 'black-proud-and-baby',
};

/** Resolves a possibly-legacy slug to its current canonical slug — a passthrough for any slug that isn't a known alias. */
function resolveLegacySlug(slug) {
  return Object.prototype.hasOwnProperty.call(LEGACY_SLUG_ALIASES, slug) ? LEGACY_SLUG_ALIASES[slug] : slug;
}

module.exports = { LEGACY_SLUG_ALIASES, resolveLegacySlug };
