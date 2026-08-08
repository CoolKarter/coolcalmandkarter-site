'use strict';

const { resolveOrderItems } = require('./resolve-order-items');
const { generateOrderNumber: defaultGenerateOrderNumber } = require('./order-number');

// Astronomically unlikely to ever loop more than once — a same-day
// orderNumber collision requires two orders to independently draw the same
// 4-hex-character suffix (1 in 65,536) — but bounded so a persistently
// broken RNG can't spin forever.
const MAX_ORDER_NUMBER_ATTEMPTS = 5;

function isDuplicateKeyOn(err, field) {
  if (!err || err.code !== 11000) return false;
  const keyPattern = err.keyPattern || {};
  if (field in keyPattern) return true;
  return typeof err.message === 'string' && err.message.includes(field);
}

/**
 * Idempotently turns a completed Stripe Checkout Session into a saved
 * Order. Safe to call more than once for the same session — a Stripe
 * webhook retry (or a redelivery after a slow/failed response) must never
 * create a second Order, generate a second order number, or trigger a
 * second round of emails.
 *
 * Idempotency has two layers:
 *  1. An up-front `findOne` by stripeSessionId — handles the common case
 *     (a straightforward retry) cheaply, before doing any Stripe API calls
 *     or building anything.
 *  2. The unique index on stripeSessionId as a backstop against a genuine
 *     race (two deliveries processed concurrently) — if `.save()` fails
 *     with a duplicate-key error on stripeSessionId, that means another
 *     call already won; this fetches and returns that order instead of
 *     treating it as a failure.
 *
 * Returns `{ created: false, order }` for an already-processed session
 * (caller should skip emails) or `{ created: true, order }` for a
 * genuinely new order (caller should send emails). Throws only for a
 * genuine, non-duplicate failure (e.g. MongoDB unreachable) — the caller
 * decides how to respond to Stripe in that case.
 *
 * All dependencies are injected (never imported directly) so this stays
 * unit-testable without a real Stripe or MongoDB connection.
 * `generateOrderNumber` defaults to the real random generator but can be
 * overridden in tests to deterministically exercise the collision-retry
 * path below.
 */
async function processCheckoutCompleted({
  session,
  stripeClient,
  catalog,
  OrderModel,
  generateOrderNumber = defaultGenerateOrderNumber,
}) {
  const existing = await OrderModel.findOne({ stripeSessionId: session.id });
  if (existing) {
    return { created: false, order: existing };
  }

  const customerEmail = session.customer_details?.email || 'no-email';
  const customerName = session.customer_details?.name || 'Customer';
  const address = session.customer_details?.address || {};
  const amount = session.amount_total || 0;

  // Titles/quantities/prices come from Stripe's own line-items record for
  // this session (mapped back to our catalog for the title), never from
  // anything the browser submitted.
  const items = await resolveOrderItems({ session, stripeClient, catalog });
  const bookTitleSummary = items.map((i) => `${i.title} x${i.quantity}`).join(', ');

  let shippingMethod = 'No shipping selected';
  if (session.shipping_cost?.shipping_rate) {
    try {
      const shippingRateObj = await stripeClient.shippingRates.retrieve(session.shipping_cost.shipping_rate);
      shippingMethod = shippingRateObj.display_name || 'No shipping selected';
    } catch (err) {
      console.error('❌ Failed to retrieve shipping rate from Stripe:', err.message);
    }
  }

  const orderFields = {
    name: customerName,
    email: customerEmail,
    bookTitle: bookTitleSummary,
    items: items.map((i) => ({
      slug: i.slug,
      title: i.title,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
    })),
    amount,
    address: {
      line1: address.line1,
      line2: address.line2 || '',
      city: address.city,
      state: address.state,
      postal_code: address.postal_code,
      country: address.country,
    },
    shippingMethod,
    stripeSessionId: session.id,
  };

  for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt += 1) {
    const orderNumber = generateOrderNumber();
    const newOrder = new OrderModel({ ...orderFields, orderNumber });

    try {
      await newOrder.save();
      return { created: true, order: newOrder };
    } catch (err) {
      if (isDuplicateKeyOn(err, 'stripeSessionId')) {
        // Another concurrent delivery for this same session won the race —
        // treat this as an already-processed session, not a failure.
        const raced = await OrderModel.findOne({ stripeSessionId: session.id });
        return { created: false, order: raced };
      }
      if (isDuplicateKeyOn(err, 'orderNumber')) {
        continue; // regenerate a new random suffix and retry
      }
      throw err;
    }
  }

  throw new Error('Failed to generate a unique order number after multiple attempts.');
}

module.exports = { processCheckoutCompleted, isDuplicateKeyOn };
