'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCustomerOrdersFilter, buildCustomerOrderDetailFilter, ORDER_EMAIL_COLLATION } = require('../lib/customer-orders');

test('buildCustomerOrdersFilter matches on emailNormalized OR the legacy email field', () => {
  const filter = buildCustomerOrdersFilter('buyer@example.com');
  assert.deepEqual(filter, { $or: [{ emailNormalized: 'buyer@example.com' }, { email: 'buyer@example.com' }] });
});

test('buildCustomerOrderDetailFilter requires BOTH the exact orderNumber AND the email match', () => {
  const filter = buildCustomerOrderDetailFilter('CCK-20260808-4F2A', 'buyer@example.com');
  assert.deepEqual(filter, {
    orderNumber: 'CCK-20260808-4F2A',
    $or: [{ emailNormalized: 'buyer@example.com' }, { email: 'buyer@example.com' }],
  });
});

test('ORDER_EMAIL_COLLATION is case-insensitive (strength 2), not a regex', () => {
  assert.equal(ORDER_EMAIL_COLLATION.strength, 2);
  assert.equal(typeof ORDER_EMAIL_COLLATION.locale, 'string');
});

// ---- Authorization simulation ----
//
// Simulates evaluating buildCustomerOrdersFilter/buildCustomerOrderDetailFilter
// against a small in-memory order set the same way MongoDB's collation
// would (case-insensitive exact match, never substring/regex), to prove
// the actual security property end-to-end: a filter built for customer A
// never matches an order belonging to customer B.

function caseInsensitiveEquals(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
}

function matchesOrderFilter(order, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') {
      return value.some((clause) => matchesOrderFilter(order, clause));
    }
    return caseInsensitiveEquals(order[key], value);
  });
}

function buildTestOrders() {
  return [
    { orderNumber: 'CCK-20260808-AAAA', emailNormalized: 'alice@example.com', email: 'alice@example.com' },
    { orderNumber: 'CCK-20260808-BBBB', emailNormalized: 'bob@example.com', email: 'bob@example.com' },
    // Legacy order: no emailNormalized at all, mixed-case stored email.
    { orderNumber: undefined, email: 'Alice@Example.com' },
  ];
}

test('customer A sees only their own orders, never customer B\'s', () => {
  const orders = buildTestOrders();
  const filter = buildCustomerOrdersFilter('alice@example.com');
  const visible = orders.filter((order) => matchesOrderFilter(order, filter));

  assert.equal(visible.length, 2); // Alice's new order + Alice's legacy mixed-case order
  assert.ok(visible.every((o) => !o.emailNormalized || o.emailNormalized === 'alice@example.com'));
  assert.ok(!visible.some((o) => o.orderNumber === 'CCK-20260808-BBBB'));
});

test('customer A requesting customer B\'s real orderNumber does not receive it', () => {
  const orders = buildTestOrders();
  const filter = buildCustomerOrderDetailFilter('CCK-20260808-BBBB', 'alice@example.com');
  const matched = orders.find((order) => matchesOrderFilter(order, filter));

  assert.equal(matched, undefined);
});

test('a legacy order with mixed-case stored email still matches via case-insensitive equality, no regex', () => {
  const orders = buildTestOrders();
  const filter = buildCustomerOrdersFilter('alice@example.com'); // normalized/lowercased, as normalize-email.js would produce
  const legacyOrder = orders.find((o) => o.email === 'Alice@Example.com');

  assert.ok(matchesOrderFilter(legacyOrder, filter));
});

test('a correct orderNumber with the WRONG email does not match', () => {
  const orders = buildTestOrders();
  const filter = buildCustomerOrderDetailFilter('CCK-20260808-AAAA', 'bob@example.com');
  const matched = orders.find((order) => matchesOrderFilter(order, filter));

  assert.equal(matched, undefined);
});
