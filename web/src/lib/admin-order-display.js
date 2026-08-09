// Pure display-shaping helpers for the admin orders dashboard — never
// fabricates missing data, only decides how to label its absence or shape
// a request body. Framework-free so this is unit-testable without a DOM.

import { ORDER_STATUSES } from './admin-order-transitions.js';

/**
 * Normalizes a possibly-missing/unrecognized status the same way the
 * backend's normalizeOrderStatus() does for display purposes — a legacy
 * order with no orderStatus at all falls back to "received", never
 * undefined/blank. Used for status-filter matching and action-button
 * selection so both agree with how the backend already rendered the
 * badge.
 */
export function normalizeOrderStatusForDisplay(status) {
  return ORDER_STATUSES.includes(status) ? status : 'received';
}

/**
 * A historical order saved before orderNumber existed. Read-only in this
 * dashboard — there is no route to open or PATCH it (the backend's detail/
 * PATCH/resend routes are all keyed on orderNumber) — see server.js's
 * Phase 13E comment on GET /api/admin/orders/:orderNumber for why this is
 * intentional rather than a bug.
 */
export function isLegacyOrder(order) {
  return !order || typeof order.orderNumber !== 'string' || order.orderNumber.trim() === '';
}

export const LEGACY_ORDER_LABEL = 'Legacy Order';
export const LEGACY_ORDER_ACTIONS_COPY = 'Legacy order — management actions unavailable.';

/** Cents -> "$X.XX", or a neutral placeholder when the amount genuinely isn't available. Identical shape to order-list-view.js's formatOrderAmount, kept local so this file has no runtime dependency on the customer-facing module. */
export function formatOrderAmount(cents) {
  return typeof cents === 'number' && Number.isFinite(cents) ? `$${(cents / 100).toFixed(2)}` : '—';
}

/**
 * Computes the dashboard overview counts from the actual returned order
 * list — never a separate/invented metric. "revenueCents" is the literal
 * sum of every order's stored `amount` field; the caller must label this
 * "Order Revenue" (or similar), never "profit" — this function has no way
 * to know cost of goods, so it only ever reports what was actually
 * charged.
 */
export function computeOrderSummary(orders) {
  const summary = {
    total: 0,
    received: 0,
    processing: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
    revenueCents: 0,
  };
  if (!Array.isArray(orders)) return summary;

  for (const order of orders) {
    summary.total += 1;
    const status = normalizeOrderStatusForDisplay(order.orderStatus);
    summary[status] += 1;
    if (typeof order.amount === 'number' && Number.isFinite(order.amount)) {
      summary.revenueCents += order.amount;
    }
  }
  return summary;
}

/**
 * Builds the PATCH body for a "Mark Shipped" submission. Trims
 * carrier/trackingNumber and OMITS either field entirely when blank —
 * never sends an empty string, matching the backend contract
 * (validateTrackingFields treats a present-but-blank field as an error,
 * not "no tracking"; omitting the key entirely is how "no tracking" is
 * expressed). Never fabricates a value.
 */
export function buildShippedPatchBody({ carrier, trackingNumber } = {}) {
  const body = { orderStatus: 'shipped' };
  const trimmedCarrier = typeof carrier === 'string' ? carrier.trim() : '';
  const trimmedTracking = typeof trackingNumber === 'string' ? trackingNumber.trim() : '';
  if (trimmedCarrier !== '') body.carrier = trimmedCarrier;
  if (trimmedTracking !== '') body.trackingNumber = trimmedTracking;
  return body;
}

// Copy constants kept here (not hardcoded inline in the .astro page) so
// their exact wording is directly testable — both explicitly avoid
// implying an automatic side effect the backend doesn't actually perform.
export const SHIPPED_NOTICE_COPY = 'Marking this order shipped will notify the customer by email.';
export const CANCEL_NOTICE_COPY =
  'This marks the order cancelled in Cool, Calm & Karter order management. It does not automatically issue a Stripe refund.';
export const STALE_ORDER_COPY = 'This order changed since you opened it. The latest information has been loaded.';
