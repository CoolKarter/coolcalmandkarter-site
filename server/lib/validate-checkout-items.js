'use strict';

// Per-line-item cap and whole-cart cap are deliberately conservative for a
// $9.99 picture-book storefront — generous enough for someone buying gifts
// for a whole family, small enough to bound abuse of an unauthenticated
// endpoint. Easy to revisit later; not derived from any external spec.
const MAX_QUANTITY_PER_ITEM = 20;
const MAX_TOTAL_CART_QUANTITY = 40;

const ALLOWED_ITEM_KEYS = new Set(['slug', 'quantity']);

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIntegerInRange(value, min, max) {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Validates a checkout request body against the server-side catalog.
 * Never trusts a client-supplied price, title, or Stripe Price ID — those
 * always come from the catalog entry, keyed only by the client-supplied
 * slug. Returns a discriminated result:
 *   { ok: true, items: [{ slug, title, stripePriceId, quantity }], totalQuantity }
 *   { ok: false, error: string }
 *
 * `catalog` is a Map as returned by checkout-catalog.js's getCatalog().
 */
function validateCheckoutItems(body, catalog) {
  if (!isPlainObject(body)) {
    return { ok: false, error: 'Request body must be an object.' };
  }

  const { items } = body;

  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'items must be a non-empty array.' };
  }

  const mergedQuantities = new Map(); // slug -> combined quantity

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];

    if (!isPlainObject(item)) {
      return { ok: false, error: `items[${index}] must be an object.` };
    }

    const keys = Object.keys(item);
    const hasUnknownKey = keys.some((key) => !ALLOWED_ITEM_KEYS.has(key));
    if (hasUnknownKey) {
      return {
        ok: false,
        error: `items[${index}] contains unsupported fields. Only "slug" and "quantity" are accepted.`,
      };
    }

    const { slug, quantity } = item;

    if (typeof slug !== 'string' || slug.trim() === '') {
      return { ok: false, error: `items[${index}].slug must be a non-empty string.` };
    }

    const product = catalog.get(slug);
    if (!product) {
      return { ok: false, error: `Unknown product: "${slug}".` };
    }

    if (!product.enabled) {
      return { ok: false, error: `"${product.title}" is not currently available for checkout.` };
    }

    if (!isIntegerInRange(quantity, 1, MAX_QUANTITY_PER_ITEM)) {
      return {
        ok: false,
        error: `items[${index}].quantity must be a whole number from 1 to ${MAX_QUANTITY_PER_ITEM}.`,
      };
    }

    mergedQuantities.set(slug, (mergedQuantities.get(slug) || 0) + quantity);
  }

  // Re-check the per-item cap on merged totals so splitting one large order
  // across duplicate slug entries can't bypass it (e.g. two entries of 15
  // each for the same book would otherwise slip through the per-entry check
  // above but total 30).
  for (const [slug, quantity] of mergedQuantities) {
    if (quantity > MAX_QUANTITY_PER_ITEM) {
      const product = catalog.get(slug);
      return {
        ok: false,
        error: `Total quantity for "${product.title}" cannot exceed ${MAX_QUANTITY_PER_ITEM}.`,
      };
    }
  }

  const totalQuantity = [...mergedQuantities.values()].reduce((sum, q) => sum + q, 0);
  if (totalQuantity > MAX_TOTAL_CART_QUANTITY) {
    return { ok: false, error: `Cart quantity cannot exceed ${MAX_TOTAL_CART_QUANTITY} items total.` };
  }

  const resolvedItems = [...mergedQuantities.entries()].map(([slug, quantity]) => {
    const product = catalog.get(slug);
    return {
      slug,
      title: product.title,
      stripePriceId: product.stripePriceId,
      quantity,
    };
  });

  return { ok: true, items: resolvedItems, totalQuantity };
}

module.exports = { validateCheckoutItems, MAX_QUANTITY_PER_ITEM, MAX_TOTAL_CART_QUANTITY };
