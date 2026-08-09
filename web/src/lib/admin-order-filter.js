// Pure client-side search/filter for the admin order list. Appropriate
// only because Phase 13E's GET /api/admin/orders already returns the
// complete list and current order volume is small — no server-side
// search/pagination is being added in this phase (see server.js's
// comment on GET /api/admin/orders for the same reasoning).

import { normalizeOrderStatusForDisplay } from './admin-order-display.js';

function matchesQuery(order, query) {
  if (!query) return true;
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;

  const haystacks = [
    order.orderNumber,
    order.name,
    order.email,
    ...(Array.isArray(order.items) ? order.items.map((item) => item.title) : []),
  ];
  return haystacks.some((value) => typeof value === 'string' && value.toLowerCase().includes(needle));
}

function matchesStatus(order, status) {
  if (!status || status === 'all') return true;
  return normalizeOrderStatusForDisplay(order.orderStatus) === status;
}

/**
 * Filters an already-fetched order list by a free-text query (matched
 * against order number, customer name, customer email, and item titles)
 * and/or a status filter. Both are optional/independent — omitting either
 * is the same as "all". Never mutates the input array.
 */
export function filterAdminOrders(orders, { query = '', status = 'all' } = {}) {
  if (!Array.isArray(orders)) return [];
  return orders.filter((order) => matchesQuery(order, query) && matchesStatus(order, status));
}
