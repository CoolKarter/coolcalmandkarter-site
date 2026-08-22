// Legacy catalog slug aliases — maps a book's OLD slug (before a
// permanent title/URL rename) to its current canonical slug. A customer's
// cart is stored in localStorage keyed by slug (see lib/cart.ts); an HTTP
// redirect protects old /books/<slug> URLs, but it does nothing for a
// slug already sitting in a browser's saved cart from before the rename —
// this module is what lets readCart() recognize and migrate that old
// entry instead of silently dropping it as "unknown".
//
// Must be kept in sync with server/lib/legacy-slug-aliases.js (the
// backend's identical copy, used to resolve a stale checkout request) —
// the two projects don't share code (see server/lib/checkout-catalog.js's
// slug-matching note), so each maintains its own copy of this same static
// mapping.
//
// Add an entry here only for a genuine, permanent catalog rename — this
// is not a general redirect mechanism.
export const LEGACY_SLUG_ALIASES = {
  'florida-beach-and-baby': 'beach-and-baby',
  'black-beautiful-and-baby': 'black-proud-and-baby',
};

/** Resolves a possibly-legacy slug to its current canonical slug — a passthrough for any slug that isn't a known alias. */
export function resolveLegacySlug(slug) {
  return Object.prototype.hasOwnProperty.call(LEGACY_SLUG_ALIASES, slug) ? LEGACY_SLUG_ALIASES[slug] : slug;
}

// Matches the server's per-item cap (server/lib/validate-checkout-items.js's
// MAX_QUANTITY_PER_ITEM) — applied only when reconciling two cart entries
// that alias to the same product, so a merge can never produce a quantity
// the backend would reject outright at checkout.
const MAX_ITEM_QUANTITY = 20;

/**
 * Pure migration step for a raw, just-parsed cart object (as read from
 * localStorage): resolves every legacy slug to its current canonical one,
 * merging (summing, capped at MAX_ITEM_QUANTITY) any quantity collision
 * this creates — e.g. a customer whose cart already has the new slug from
 * a return visit, alongside a leftover old-slug entry from before the
 * rename. Framework-free (no window/localStorage) so it's directly
 * unit-testable — see web/test/legacy-slug-aliases.test.js. lib/cart.ts's
 * readCart() calls this and owns the actual storage read/write.
 */
export function migrateCartSlugs(rawCart) {
  const cart = {};
  let migrated = false;

  for (const [rawSlug, rawQuantity] of Object.entries(rawCart)) {
    const n = Number(rawQuantity);
    if (typeof rawSlug !== 'string' || !Number.isFinite(n) || n <= 0) continue;

    const slug = resolveLegacySlug(rawSlug);
    if (slug !== rawSlug) migrated = true;

    const merged = (cart[slug] ?? 0) + n;
    cart[slug] = Math.min(merged, MAX_ITEM_QUANTITY);
  }

  return { cart, migrated };
}
