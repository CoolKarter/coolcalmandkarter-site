'use strict';

const { validateTrackingFields } = require('./order-tracking');

const ORDER_STATUSES = ['received', 'processing', 'shipped', 'delivered', 'cancelled'];
const DEFAULT_ORDER_STATUS = 'received';

// received → processing → shipped → delivered is the normal progression.
// received/processing → shipped is also allowed as a deliberate forward
// skip: a small business that packs and ships same-day has no real use for
// a mandatory "processing" acknowledgment step, and forcing one would just
// be friction with no operational benefit. delivered/cancelled are final —
// nothing transitions out of either. shipped only ever moves to delivered;
// an order already in transit isn't "cancelled" in this system (that's a
// future returns/refunds concern, not a status-model concern here).
const ALLOWED_TRANSITIONS = {
  received: ['processing', 'shipped', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

/**
 * Normalizes any stored/input value down to one of the five known
 * statuses. Anything not recognized — missing (undefined/null, the case
 * for every order saved before this field existed), garbage, or an
 * unrecognized string — normalizes to the default, "received". Never
 * throws, so this is safe to call on any historical order unconditionally.
 */
function normalizeOrderStatus(rawStatus) {
  if (typeof rawStatus === 'string' && ORDER_STATUSES.includes(rawStatus)) {
    return rawStatus;
  }
  return DEFAULT_ORDER_STATUS;
}

/**
 * Whether a transition from `currentStatusRaw` to `nextStatusRaw` is
 * allowed. Both sides are normalized first, so an unrecognized/missing
 * current status is treated as "received" for this check too. Re-applying
 * the same status (a resubmitted/duplicate admin action) is always
 * allowed as a no-op — see applyOrderStatusTransition for why that's safe.
 */
function canTransitionOrderStatus(currentStatusRaw, nextStatusRaw) {
  const current = normalizeOrderStatus(currentStatusRaw);
  const next = normalizeOrderStatus(nextStatusRaw);
  if (current === next) return true;
  return ALLOWED_TRANSITIONS[current].includes(next);
}

/**
 * Pure decision function: given an order-like object and a desired next
 * status, returns either `{ ok: true, patch }` describing exactly which
 * fields should be written, or `{ ok: false, error }`. Never mutates
 * `order` and never touches a database — the caller (a future admin route,
 * not built in this phase) is responsible for actually persisting `patch`.
 *
 * Timestamps are entirely server-controlled: `shippedAt`/`deliveredAt`/
 * `cancelledAt` are never accepted as input here, only ever set to `now`
 * (injectable for tests) the first time an order genuinely transitions
 * into that state. Re-processing an already-shipped order into "shipped"
 * again (e.g. a resubmitted admin action) is a no-op with respect to that
 * timestamp — it is never overwritten once legitimately set.
 *
 * `carrier`/`trackingNumber` are optional even when transitioning to
 * "shipped" — some real shipments genuinely have no trackable number, and
 * requiring one would just pressure whoever's fulfilling orders to invent
 * a placeholder to get past validation, which is the opposite of what
 * this system is for. If either is supplied, it's validated (trimmed,
 * non-blank, reasonably sized) via order-tracking.js — never fabricated.
 */
function applyOrderStatusTransition(order = {}, nextStatusRaw, { carrier, trackingNumber, now = new Date() } = {}) {
  const currentStatus = normalizeOrderStatus(order.orderStatus);
  const nextStatus = normalizeOrderStatus(nextStatusRaw);

  if (!canTransitionOrderStatus(currentStatus, nextStatus)) {
    return { ok: false, error: `Cannot transition an order from "${currentStatus}" to "${nextStatus}".` };
  }

  const patch = { orderStatus: nextStatus };

  if (nextStatus === 'shipped') {
    const trackingResult = validateTrackingFields({ carrier, trackingNumber });
    if (!trackingResult.ok) return trackingResult;
    if (trackingResult.carrier !== undefined) patch.carrier = trackingResult.carrier;
    if (trackingResult.trackingNumber !== undefined) patch.trackingNumber = trackingResult.trackingNumber;
    if (!order.shippedAt) patch.shippedAt = now;
  }

  if (nextStatus === 'delivered' && !order.deliveredAt) {
    patch.deliveredAt = now;
  }

  if (nextStatus === 'cancelled' && !order.cancelledAt) {
    patch.cancelledAt = now;
  }

  return { ok: true, patch };
}

module.exports = {
  ORDER_STATUSES,
  DEFAULT_ORDER_STATUS,
  ALLOWED_TRANSITIONS,
  normalizeOrderStatus,
  canTransitionOrderStatus,
  applyOrderStatusTransition,
};
