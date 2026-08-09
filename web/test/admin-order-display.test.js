import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOrderStatusForDisplay,
  isLegacyOrder,
  formatOrderAmount,
  computeOrderSummary,
  buildShippedPatchBody,
  SHIPPED_NOTICE_COPY,
  CANCEL_NOTICE_COPY,
  LEGACY_ORDER_ACTIONS_COPY,
} from '../src/lib/admin-order-display.js';

// ---- normalizeOrderStatusForDisplay ----

test('passes through every recognized status unchanged', () => {
  for (const status of ['received', 'processing', 'shipped', 'delivered', 'cancelled']) {
    assert.equal(normalizeOrderStatusForDisplay(status), status);
  }
});

test('normalizes a missing/unrecognized status to "received"', () => {
  assert.equal(normalizeOrderStatusForDisplay(undefined), 'received');
  assert.equal(normalizeOrderStatusForDisplay('garbage'), 'received');
});

// ---- isLegacyOrder ----

test('an order with a real orderNumber is not legacy', () => {
  assert.equal(isLegacyOrder({ orderNumber: 'CCK-20260808-4F2A' }), false);
});

test('an order with no orderNumber, or a blank one, is legacy', () => {
  assert.equal(isLegacyOrder({ orderNumber: null }), true);
  assert.equal(isLegacyOrder({}), true);
  assert.equal(isLegacyOrder({ orderNumber: '' }), true);
  assert.equal(isLegacyOrder({ orderNumber: '   ' }), true);
});

test('never throws on undefined/null input', () => {
  assert.doesNotThrow(() => isLegacyOrder(undefined));
  assert.doesNotThrow(() => isLegacyOrder(null));
  assert.equal(isLegacyOrder(undefined), true);
});

// ---- formatOrderAmount ----

test('formats cents as a dollar string', () => {
  assert.equal(formatOrderAmount(2997), '$29.97');
  assert.equal(formatOrderAmount(0), '$0.00');
});

test('falls back to a neutral placeholder for a missing/invalid amount, never $0.00 or $NaN', () => {
  assert.equal(formatOrderAmount(undefined), '—');
  assert.equal(formatOrderAmount(null), '—');
  assert.equal(formatOrderAmount(NaN), '—');
  assert.equal(formatOrderAmount('not-a-number'), '—');
});

// ---- computeOrderSummary ----

test('counts orders by status and sums revenue from actual stored amounts only', () => {
  const orders = [
    { orderStatus: 'received', amount: 1000 },
    { orderStatus: 'received', amount: 2000 },
    { orderStatus: 'processing', amount: 500 },
    { orderStatus: 'shipped', amount: 1500 },
    { orderStatus: 'delivered', amount: 3000 },
    { orderStatus: 'cancelled', amount: 900 },
  ];
  const summary = computeOrderSummary(orders);
  assert.equal(summary.total, 6);
  assert.equal(summary.received, 2);
  assert.equal(summary.processing, 1);
  assert.equal(summary.shipped, 1);
  assert.equal(summary.delivered, 1);
  assert.equal(summary.cancelled, 1);
  assert.equal(summary.revenueCents, 1000 + 2000 + 500 + 1500 + 3000 + 900);
});

test('a legacy order with no orderStatus counts as "received", matching how it displays', () => {
  const summary = computeOrderSummary([{ amount: 500 }]);
  assert.equal(summary.received, 1);
});

test('an order with no amount contributes zero to revenue, not NaN', () => {
  const summary = computeOrderSummary([{ orderStatus: 'received', amount: undefined }]);
  assert.equal(summary.revenueCents, 0);
  assert.ok(Number.isFinite(summary.revenueCents));
});

test('an empty or non-array input produces a safe zeroed summary', () => {
  assert.deepEqual(computeOrderSummary([]), {
    total: 0, received: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0, revenueCents: 0,
  });
  assert.deepEqual(computeOrderSummary(undefined), {
    total: 0, received: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0, revenueCents: 0,
  });
});

// ---- buildShippedPatchBody ----

test('includes real carrier/trackingNumber when both are supplied', () => {
  const body = buildShippedPatchBody({ carrier: 'USPS', trackingNumber: '9400111899223197428490' });
  assert.deepEqual(body, { orderStatus: 'shipped', carrier: 'USPS', trackingNumber: '9400111899223197428490' });
});

test('omits carrier/trackingNumber entirely when neither is supplied — never sends blank strings', () => {
  const body = buildShippedPatchBody({});
  assert.deepEqual(body, { orderStatus: 'shipped' });
  assert.equal('carrier' in body, false);
  assert.equal('trackingNumber' in body, false);
});

test('omits a field that is only whitespace', () => {
  const body = buildShippedPatchBody({ carrier: '   ', trackingNumber: '\t' });
  assert.deepEqual(body, { orderStatus: 'shipped' });
});

test('trims incidental whitespace from real values', () => {
  const body = buildShippedPatchBody({ carrier: '  UPS  ', trackingNumber: '  1Z999  ' });
  assert.equal(body.carrier, 'UPS');
  assert.equal(body.trackingNumber, '1Z999');
});

test('allows one field supplied and the other omitted', () => {
  const carrierOnly = buildShippedPatchBody({ carrier: 'FedEx' });
  assert.deepEqual(carrierOnly, { orderStatus: 'shipped', carrier: 'FedEx' });
});

test('never fabricates a tracking number or carrier — no default values baked in', () => {
  const body = buildShippedPatchBody(undefined);
  assert.deepEqual(body, { orderStatus: 'shipped' });
});

// ---- Copy constants ----

test('the shipped notice tells the admin the customer will be emailed', () => {
  assert.match(SHIPPED_NOTICE_COPY.toLowerCase(), /email/);
  assert.match(SHIPPED_NOTICE_COPY.toLowerCase(), /notif|customer/);
});

test('the cancel notice explicitly does NOT claim an automatic Stripe refund', () => {
  const lower = CANCEL_NOTICE_COPY.toLowerCase();
  assert.match(lower, /does not automatically issue a stripe refund/);
});

test('legacy-order copy makes clear management actions are unavailable', () => {
  assert.match(LEGACY_ORDER_ACTIONS_COPY.toLowerCase(), /unavailable/);
});
