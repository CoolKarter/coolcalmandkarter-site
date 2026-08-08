'use strict';

const { normalizeOrderStatus } = require('./order-status');

// Both view functions build their result by explicitly listing which
// fields to include (an allow-list), never by copying `order` and
// deleting sensitive fields off it (a deny-list). An allow-list can't
// leak a field nobody remembered to exclude — that's what guarantees
// _id/__v/stripeSessionId/any other internal Mongo field never reaches
// the customer view, structurally, not by discipline.

function toCustomerOrderItem(item = {}) {
  return {
    slug: item.slug ?? null,
    title: item.title ?? null,
    quantity: typeof item.quantity === 'number' ? item.quantity : null,
    unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : null,
    lineTotal: typeof item.lineTotal === 'number' ? item.lineTotal : null,
  };
}

function toAddressView(address) {
  if (!address || typeof address !== 'object') return null;
  return {
    line1: address.line1 ?? null,
    line2: address.line2 ?? null,
    city: address.city ?? null,
    state: address.state ?? null,
    postal_code: address.postal_code ?? null,
    country: address.country ?? null,
  };
}

/**
 * Customer-facing order view. Never invents missing data — legacy orders
 * saved before item pricing, slugs, or an order number existed simply
 * render those fields as null; the caller (a future My Orders page) is
 * responsible for displaying that gracefully, not this function. Tracking
 * fields are included only when legitimately present (order-tracking.js
 * never fabricates them, so a null here always means "genuinely not
 * available yet," never a placeholder).
 */
function toCustomerOrderView(order = {}) {
  return {
    orderNumber: order.orderNumber ?? null,
    date: order.date ?? null,
    items: Array.isArray(order.items) ? order.items.map(toCustomerOrderItem) : [],
    amount: typeof order.amount === 'number' ? order.amount : null,
    shippingMethod: order.shippingMethod ?? null,
    address: toAddressView(order.address),
    orderStatus: normalizeOrderStatus(order.orderStatus),
    carrier: order.carrier ?? null,
    trackingNumber: order.trackingNumber ?? null,
    shippedAt: order.shippedAt ?? null,
    deliveredAt: order.deliveredAt ?? null,
  };
}

/**
 * Admin-facing order view — everything the customer view has, plus the
 * internal/operational fields an administrator legitimately needs
 * (customer identity, the Stripe Checkout Session ID for Dashboard
 * troubleshooting, cancellation timestamp). Still never includes a Mongo
 * _id/__v or any server credential — none of those are read here, so
 * there's nothing to accidentally leak.
 */
function toAdminOrderView(order = {}) {
  return {
    ...toCustomerOrderView(order),
    name: order.name ?? null,
    email: order.email ?? null,
    stripeSessionId: order.stripeSessionId ?? null,
    cancelledAt: order.cancelledAt ?? null,
  };
}

module.exports = { toCustomerOrderView, toAdminOrderView };
