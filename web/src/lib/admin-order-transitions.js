// Mirrors the approved status transition table from
// server/lib/order-status.js's ALLOWED_TRANSITIONS exactly — this is a
// deliberate, documented duplication (the frontend has no way to import a
// server/ module; they're separate npm packages/runtimes), used ONLY to
// decide which action buttons to RENDER. The backend remains the sole
// source of truth/enforcement: every PATCH still goes through the real
// applyOrderStatusTransition() server-side regardless of what this file
// says, and a 400/409 from the server is handled independently of
// whatever button was shown. If order-status.js's table ever changes,
// this file must be updated to match — see web/test/admin-order-transitions.test.js
// for tests that assert the exact same transition set as
// server/test/order-status.test.js.

const ALLOWED_TRANSITIONS = {
  received: ['processing', 'shipped', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

const ORDER_STATUSES = Object.keys(ALLOWED_TRANSITIONS);

const ACTION_LABELS = {
  processing: 'Mark Processing',
  shipped: 'Mark Shipped',
  delivered: 'Mark Delivered',
  cancelled: 'Cancel Order',
};

/**
 * Returns the list of next-status action descriptors valid for the given
 * current status, e.g. `[{ status: 'processing', label: 'Mark Processing' }, ...]`.
 * An unrecognized/missing status (a legacy order, or any value the backend
 * hasn't normalized) is treated as "received" — the same fallback the
 * backend's own normalizeOrderStatus() uses — so the UI never renders
 * impossible actions for it either.
 */
export function getAvailableActions(orderStatus) {
  const current = ALLOWED_TRANSITIONS[orderStatus] ? orderStatus : 'received';
  return ALLOWED_TRANSITIONS[current].map((status) => ({ status, label: ACTION_LABELS[status] }));
}

export { ALLOWED_TRANSITIONS, ORDER_STATUSES };
