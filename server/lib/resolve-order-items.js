'use strict';

const { findByPriceId } = require('./checkout-catalog');

/**
 * Parses the legacy metadata format written by the LEGACY
 * /create-checkout-session route: a JSON-stringified array of
 * `{ price, quantity, title }` objects. Titles here came from the browser
 * at session-creation time — an inherited trust boundary from before this
 * catalog existed. Kept only so orders from the legacy route (still live
 * until the Astro cutover) can still be summarized. Never throws — a
 * malformed array yields an empty result instead of breaking the webhook.
 */
function parseLegacyMetadataItems(parsed) {
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const quantity = Number(entry.quantity);
      const title =
        (typeof entry.title === 'string' && entry.title.trim()) ||
        (typeof entry.name === 'string' && entry.name.trim()) ||
        'Unknown item';
      return {
        slug: null,
        title,
        quantity: Number.isFinite(quantity) && quantity > 0 ? Math.trunc(quantity) : 1,
      };
    });
}

/**
 * Parses the compact "slug:quantity,slug:quantity" metadata format written
 * by the secure /api/checkout/session route, resolving each slug's title
 * from the server-side catalog — never from anything stored in metadata
 * itself.
 */
function parseCompactMetadataItems(raw, catalog) {
  return raw
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [slug, quantityRaw] = pair.split(':');
      const product = catalog.get(slug);
      const quantity = Number(quantityRaw);
      return {
        slug: product ? slug : null,
        title: product ? product.title : 'Unknown item',
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      };
    });
}

/**
 * Parses session.metadata.items, understanding both metadata generations:
 * the new compact "slug:quantity" string (secure route) and the legacy
 * JSON-array-of-objects string (legacy route). Used only as a fallback if
 * the Stripe line-items lookup fails. Never throws on malformed input —
 * returns an empty array instead so the webhook degrades gracefully rather
 * than breaking order-saving/emails outright.
 */
function parseMetadataItems(raw, catalog) {
  if (!raw || typeof raw !== 'string') return [];

  const trimmed = raw.trim();
  if (trimmed === '') return [];

  if (trimmed.startsWith('[')) {
    try {
      return parseLegacyMetadataItems(JSON.parse(trimmed));
    } catch (err) {
      console.error('❌ Failed to parse legacy checkout metadata:', err.message);
      return [];
    }
  }

  return parseCompactMetadataItems(trimmed, catalog);
}

/**
 * Resolves the real, paid-for line items for a completed Checkout Session
 * from Stripe's own record (session.line_items), rather than trusting
 * client-submitted titles at any point. Each line item's Price ID is
 * mapped back to our own catalog to get the authoritative title — the
 * title never comes from Stripe's product name or client input.
 *
 * Falls back to parsing the compact server-generated metadata (still
 * catalog-resolved, never client-supplied) if the Stripe API call fails,
 * so order-saving/emails degrade gracefully instead of breaking outright.
 *
 * `stripeClient` is injected (rather than imported directly) so this stays
 * unit-testable without a real network call.
 */
async function resolveOrderItems({ session, stripeClient, catalog }) {
  try {
    const lineItems = await stripeClient.checkout.sessions.listLineItems(session.id, { limit: 100 });

    return lineItems.data.map((lineItem) => {
      const priceId = typeof lineItem.price === 'string' ? lineItem.price : lineItem.price?.id;
      const product = findByPriceId(catalog, priceId);
      return {
        slug: product ? product.slug : null,
        title: product ? product.title : 'Unknown item',
        quantity: lineItem.quantity || 1,
      };
    });
  } catch (err) {
    console.error('❌ Failed to list line items from Stripe, falling back to metadata:', err.message);
    return parseMetadataItems(session.metadata?.items, catalog);
  }
}

module.exports = { resolveOrderItems, parseMetadataItems };
