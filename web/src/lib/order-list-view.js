// Pure display-shaping helpers for rendering a customer's order list/detail
// — never fabricates missing data, only decides how to label its absence.
// Framework-free so this is unit-testable without a DOM — see
// web/test/order-list-view.test.js. The actual DOM building lives in
// my-orders.astro's client script, which calls these.

const STATUS_LABELS = {
  received: 'Received',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/**
 * The customer-facing order number, or a neutral, honest label for a
 * historical order that predates order numbers — never a Mongo _id or any
 * other internal identifier standing in for one.
 */
export function getOrderDisplayNumber(order) {
  return order && typeof order.orderNumber === 'string' && order.orderNumber.trim() !== ''
    ? order.orderNumber
    : 'Earlier Order';
}

/**
 * Human label for a status value. The backend already normalizes a
 * missing/legacy orderStatus to "received" (see order-status.js) before
 * this ever runs, so an unrecognized value here falls back to the same
 * "Received" label rather than rendering blank or throwing.
 */
export function getOrderStatusLabel(status) {
  return STATUS_LABELS[status] || STATUS_LABELS.received;
}

/** Whether an order has genuine (never fabricated) tracking information to show. */
export function hasRealTrackingInfo(order) {
  return Boolean(order && (order.carrier || order.trackingNumber));
}

/**
 * Resolves a cover image for an order line item from the build-time
 * slug -> {src, alt} map (see my-orders.astro's frontmatter). Returns null
 * — never a guess — when the item has no slug (a legacy order) or the
 * slug isn't in the map; the caller renders a generic placeholder or
 * omits the image entirely in that case, never invents a match.
 */
export function resolveCoverForItem(item, coverMap) {
  if (!item || typeof item.slug !== 'string' || !coverMap) return null;
  return coverMap[item.slug] ?? null;
}

/** Cents -> "$X.XX", or a neutral placeholder when the amount genuinely isn't available. */
export function formatOrderAmount(cents) {
  return typeof cents === 'number' && Number.isFinite(cents) ? `$${(cents / 100).toFixed(2)}` : '—';
}
