'use strict';

const { formatCurrency } = require('./email-templates');

// Deliberately plain ASCII — no emoji, no "•"/em-dash/smart-quote style
// characters. A single character outside the GSM-7 alphabet forces the
// *entire* SMS into UCS-2 encoding, which cuts the per-segment limit from
// 160 characters to 70 — turning an otherwise one-segment message into two.
// Staying in GSM-7 keeps a typical order notification a single segment.

function pluralizeBook(count) {
  return count === 1 ? 'book' : 'books';
}

/**
 * Builds the admin SMS body for a newly-created order. Pure function —
 * plain order data in, string out — so it's testable without touching
 * Twilio at all. Deliberately omits shipping address, Stripe Session ID,
 * and any Mongo identifier — none of that belongs in an SMS.
 */
function buildOrderNotificationSms(order) {
  const totalQuantity = Array.isArray(order.items)
    ? order.items.reduce((sum, item) => sum + (typeof item.quantity === 'number' ? item.quantity : 0), 0)
    : 0;
  const total = formatCurrency(order.amount) ?? 'unknown total';
  const orderNumber = order.orderNumber || 'New order';

  const lines = [
    'New CCK Order',
    orderNumber,
    `${totalQuantity} ${pluralizeBook(totalQuantity)} - ${total}`,
  ];

  if (order.name) {
    lines.push(order.name);
  }

  lines.push('Check admin dashboard for details.');

  return lines.join('\n');
}

module.exports = { buildOrderNotificationSms };
