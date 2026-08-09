'use strict';

const { ORDER_STATUSES, applyOrderStatusTransition } = require('./order-status');

/**
 * Validates and applies an admin PATCH request body against the current
 * order. Reads ONLY orderStatus/carrier/trackingNumber off `body` — any
 * other key present is simply never looked at, so it's structurally
 * impossible for an arbitrary field to reach Mongo through this function,
 * not merely a matter of discipline.
 *
 * All transition-table/timestamp/tracking-validation logic is delegated to
 * applyOrderStatusTransition() (order-status.js) — this function only adds
 * the input-shape validation an admin-supplied HTTP body needs that a bare
 * status string doesn't: a missing/unrecognized `orderStatus` is reported
 * as a 400 here, rather than silently normalized to "received" the way
 * normalizeOrderStatus() does for *displaying* legacy data (that leniency
 * is wrong for validating admin write input).
 *
 * Returns `{ ok: true, patch, enteredShipped }` — `enteredShipped` is true
 * only when this patch represents a genuine first transition into
 * "shipped" (i.e. `patch.shippedAt` was set), which is exactly the signal
 * the route uses to decide whether to fire the one-time shipping email —
 * or `{ ok: false, status, error }` on any rejection.
 */
function buildAdminOrderPatch(order, body = {}) {
  const { orderStatus, carrier, trackingNumber } = body || {};

  if (typeof orderStatus !== 'string' || !ORDER_STATUSES.includes(orderStatus)) {
    return { ok: false, status: 400, error: `orderStatus must be one of: ${ORDER_STATUSES.join(', ')}.` };
  }

  const result = applyOrderStatusTransition(order, orderStatus, { carrier, trackingNumber });
  if (!result.ok) {
    return { ok: false, status: 400, error: result.error };
  }

  return { ok: true, patch: result.patch, enteredShipped: Boolean(result.patch.shippedAt) };
}

/**
 * Builds the Mongo match condition used to make the PATCH's write
 * conditional on the order's status being unchanged since it was read —
 * a lightweight optimistic-concurrency guard against two admins (or two
 * overlapping requests) racing to update the same order. Uses the RAW
 * (un-normalized) status actually read from the database, not the
 * display-normalized one: a legacy order with no orderStatus field at all
 * must match on "field absent" ({ $exists: false }), not on the literal
 * value "received" it would display as — those are different documents at
 * the database level, and treating them as the same would let a
 * concurrent write through undetected.
 */
function buildOrderStatusMatchCondition(rawOrderStatus) {
  if (rawOrderStatus === undefined || rawOrderStatus === null) {
    return { orderStatus: { $exists: false } };
  }
  return { orderStatus: rawOrderStatus };
}

module.exports = { buildAdminOrderPatch, buildOrderStatusMatchCondition };
