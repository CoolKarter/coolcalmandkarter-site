'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ORDER_STATUSES,
  DEFAULT_ORDER_STATUS,
  normalizeOrderStatus,
  canTransitionOrderStatus,
  applyOrderStatusTransition,
} = require('../lib/order-status');

// ---- normalizeOrderStatus ----

test('normalizes a missing (undefined) status — every historical order — to "received"', () => {
  assert.equal(normalizeOrderStatus(undefined), 'received');
  assert.equal(DEFAULT_ORDER_STATUS, 'received');
});

test('normalizes null and garbage/unrecognized values to "received" rather than throwing', () => {
  assert.equal(normalizeOrderStatus(null), 'received');
  assert.equal(normalizeOrderStatus(''), 'received');
  assert.equal(normalizeOrderStatus('not-a-real-status'), 'received');
  assert.equal(normalizeOrderStatus(42), 'received');
});

test('passes through every genuinely recognized status unchanged', () => {
  for (const status of ORDER_STATUSES) {
    assert.equal(normalizeOrderStatus(status), status);
  }
});

// ---- canTransitionOrderStatus ----

test('allows the documented normal progression: received -> processing -> shipped -> delivered', () => {
  assert.equal(canTransitionOrderStatus('received', 'processing'), true);
  assert.equal(canTransitionOrderStatus('processing', 'shipped'), true);
  assert.equal(canTransitionOrderStatus('shipped', 'delivered'), true);
});

test('allows the safe forward-skip received -> shipped (same-day fulfillment, no forced "processing" step)', () => {
  assert.equal(canTransitionOrderStatus('received', 'shipped'), true);
});

test('allows cancellation from received and processing', () => {
  assert.equal(canTransitionOrderStatus('received', 'cancelled'), true);
  assert.equal(canTransitionOrderStatus('processing', 'cancelled'), true);
});

test('rejects cancellation once an order has shipped or delivered', () => {
  assert.equal(canTransitionOrderStatus('shipped', 'cancelled'), false);
  assert.equal(canTransitionOrderStatus('delivered', 'cancelled'), false);
});

test('delivered and cancelled are final states — nothing transitions out of either', () => {
  for (const target of ORDER_STATUSES) {
    if (target !== 'delivered') assert.equal(canTransitionOrderStatus('delivered', target), false);
    if (target !== 'cancelled') assert.equal(canTransitionOrderStatus('cancelled', target), false);
  }
});

test('rejects nonsensical backwards transitions', () => {
  assert.equal(canTransitionOrderStatus('delivered', 'processing'), false);
  assert.equal(canTransitionOrderStatus('shipped', 'received'), false);
  assert.equal(canTransitionOrderStatus('cancelled', 'processing'), false);
  assert.equal(canTransitionOrderStatus('shipped', 'processing'), false);
  assert.equal(canTransitionOrderStatus('processing', 'received'), false);
});

test('delivered is only reachable directly from shipped, never skipped to', () => {
  assert.equal(canTransitionOrderStatus('received', 'delivered'), false);
  assert.equal(canTransitionOrderStatus('processing', 'delivered'), false);
});

test('re-applying the same status is always allowed as an idempotent no-op', () => {
  for (const status of ORDER_STATUSES) {
    assert.equal(canTransitionOrderStatus(status, status), true);
  }
});

test('a missing/legacy current status is treated as "received" for transition purposes', () => {
  assert.equal(canTransitionOrderStatus(undefined, 'processing'), true);
  assert.equal(canTransitionOrderStatus(undefined, 'delivered'), false);
});

// ---- applyOrderStatusTransition: timestamps ----

test('transitioning into shipped sets shippedAt to the provided server time', () => {
  const now = new Date('2026-08-08T12:00:00Z');
  const result = applyOrderStatusTransition({ orderStatus: 'received' }, 'shipped', { now });
  assert.equal(result.ok, true);
  assert.equal(result.patch.orderStatus, 'shipped');
  assert.equal(result.patch.shippedAt, now);
});

test('shippedAt is never set before a real transition into shipped occurs', () => {
  const result = applyOrderStatusTransition({ orderStatus: 'received' }, 'processing', { now: new Date() });
  assert.equal(result.ok, true);
  assert.equal('shippedAt' in result.patch, false);
});

test('transitioning into delivered sets deliveredAt, and only delivered from shipped is allowed', () => {
  const now = new Date('2026-08-10T09:00:00Z');
  const result = applyOrderStatusTransition({ orderStatus: 'shipped', shippedAt: new Date('2026-08-08T12:00:00Z') }, 'delivered', { now });
  assert.equal(result.ok, true);
  assert.equal(result.patch.deliveredAt, now);
});

test('deliveredAt is never fabricated before a real delivered transition', () => {
  const result = applyOrderStatusTransition({ orderStatus: 'shipped' }, 'shipped', { now: new Date() });
  assert.equal('deliveredAt' in result.patch, false);
});

test('re-transitioning into an already-set status does not overwrite the existing legitimate timestamp', () => {
  const originalShippedAt = new Date('2026-08-08T12:00:00Z');
  const laterNow = new Date('2026-08-09T08:00:00Z');
  const order = { orderStatus: 'shipped', shippedAt: originalShippedAt };

  const result = applyOrderStatusTransition(order, 'shipped', { now: laterNow });

  assert.equal(result.ok, true);
  assert.equal('shippedAt' in result.patch, false); // not present in the patch at all — nothing to overwrite with
});

test('cancellation sets cancelledAt on first transition into cancelled', () => {
  const now = new Date('2026-08-08T15:00:00Z');
  const result = applyOrderStatusTransition({ orderStatus: 'received' }, 'cancelled', { now });
  assert.equal(result.ok, true);
  assert.equal(result.patch.cancelledAt, now);
});

test('cancelledAt is not re-set on a repeated cancelled transition', () => {
  const original = new Date('2026-08-08T15:00:00Z');
  const result = applyOrderStatusTransition({ orderStatus: 'cancelled', cancelledAt: original }, 'cancelled', { now: new Date('2026-08-09T00:00:00Z') });
  assert.equal(result.ok, true);
  assert.equal('cancelledAt' in result.patch, false);
});

// ---- applyOrderStatusTransition: rejection ----

test('rejects an invalid transition and returns an error instead of a patch', () => {
  const result = applyOrderStatusTransition({ orderStatus: 'delivered' }, 'processing', { now: new Date() });
  assert.equal(result.ok, false);
  assert.match(result.error, /delivered/);
  assert.equal('patch' in result, false);
});

test('treats a legacy order with no orderStatus as "received" as the starting point', () => {
  const result = applyOrderStatusTransition({}, 'processing', { now: new Date() });
  assert.equal(result.ok, true);
  assert.equal(result.patch.orderStatus, 'processing');
});

// ---- applyOrderStatusTransition: tracking integration ----

test('accepts real carrier/trackingNumber when transitioning to shipped', () => {
  const now = new Date('2026-08-08T12:00:00Z');
  const result = applyOrderStatusTransition(
    { orderStatus: 'received' },
    'shipped',
    { now, carrier: 'USPS', trackingNumber: '9400111899223197428490' },
  );
  assert.equal(result.ok, true);
  assert.equal(result.patch.carrier, 'USPS');
  assert.equal(result.patch.trackingNumber, '9400111899223197428490');
});

test('allows transitioning to shipped with no carrier/trackingNumber at all — tracking is not required', () => {
  const result = applyOrderStatusTransition({ orderStatus: 'received' }, 'shipped', { now: new Date() });
  assert.equal(result.ok, true);
  assert.equal('carrier' in result.patch, false);
  assert.equal('trackingNumber' in result.patch, false);
});

test('rejects an invalid (whitespace-only) carrier/trackingNumber rather than fabricating or silently dropping it', () => {
  const result = applyOrderStatusTransition({ orderStatus: 'received' }, 'shipped', { now: new Date(), carrier: '   ' });
  assert.equal(result.ok, false);
  assert.match(result.error, /carrier/i);
});

test('never invents tracking information for non-shipped transitions', () => {
  const result = applyOrderStatusTransition({ orderStatus: 'received' }, 'processing', { now: new Date() });
  assert.equal('carrier' in result.patch, false);
  assert.equal('trackingNumber' in result.patch, false);
});
