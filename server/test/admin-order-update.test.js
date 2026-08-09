'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAdminOrderPatch, buildOrderStatusMatchCondition } = require('../lib/admin-order-update');

// ---- buildAdminOrderPatch: input whitelist / shape validation ----

test('rejects a PATCH body with a missing orderStatus', () => {
  const result = buildAdminOrderPatch({ orderStatus: 'received' }, {});
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.match(result.error, /orderStatus/);
});

test('rejects a PATCH body with an unrecognized orderStatus string (never silently falls back to "received")', () => {
  const result = buildAdminOrderPatch({ orderStatus: 'received' }, { orderStatus: 'not-a-real-status' });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test('ignores any field beyond orderStatus/carrier/trackingNumber — never forwarded into the patch', () => {
  const result = buildAdminOrderPatch(
    { orderStatus: 'received' },
    { orderStatus: 'processing', _id: 'evil-id', __v: 99, email: 'attacker@example.com', isAdmin: true },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.patch).sort(), ['orderStatus']);
});

// ---- buildAdminOrderPatch: approved transitions (delegates to order-status.js) ----

test('allows all six approved transitions', () => {
  const cases = [
    ['received', 'processing'],
    ['received', 'shipped'],
    ['received', 'cancelled'],
    ['processing', 'shipped'],
    ['processing', 'cancelled'],
    ['shipped', 'delivered'],
  ];
  for (const [from, to] of cases) {
    const result = buildAdminOrderPatch({ orderStatus: from }, { orderStatus: to });
    assert.equal(result.ok, true, `expected ${from} -> ${to} to be allowed`);
    assert.equal(result.patch.orderStatus, to);
  }
});

test('rejects backwards/invalid transitions', () => {
  const cases = [
    ['shipped', 'received'],
    ['delivered', 'processing'],
    ['cancelled', 'processing'],
    ['delivered', 'shipped'],
    ['cancelled', 'shipped'],
    ['shipped', 'processing'],
  ];
  for (const [from, to] of cases) {
    const result = buildAdminOrderPatch({ orderStatus: from }, { orderStatus: to });
    assert.equal(result.ok, false, `expected ${from} -> ${to} to be rejected`);
    assert.equal(result.status, 400);
  }
});

test('same-status resubmission is a safe no-op', () => {
  const result = buildAdminOrderPatch({ orderStatus: 'processing' }, { orderStatus: 'processing' });
  assert.equal(result.ok, true);
  assert.equal(result.patch.orderStatus, 'processing');
});

test('a legacy order with no orderStatus at all is treated as "received" as the starting point', () => {
  const result = buildAdminOrderPatch({}, { orderStatus: 'processing' });
  assert.equal(result.ok, true);
});

// ---- buildAdminOrderPatch: enteredShipped signal (drives the one-time shipping email) ----

test('enteredShipped is true on a genuine first transition into shipped', () => {
  const result = buildAdminOrderPatch({ orderStatus: 'received' }, { orderStatus: 'shipped' });
  assert.equal(result.ok, true);
  assert.equal(result.enteredShipped, true);
  assert.ok(result.patch.shippedAt instanceof Date);
});

test('enteredShipped is false when re-PATCHing an order that is already shipped (e.g. correcting a tracking-number typo)', () => {
  const alreadyShipped = { orderStatus: 'shipped', shippedAt: new Date('2026-08-01T00:00:00Z') };
  const result = buildAdminOrderPatch(alreadyShipped, { orderStatus: 'shipped', trackingNumber: 'CORRECTED123' });
  assert.equal(result.ok, true);
  assert.equal(result.enteredShipped, false);
  assert.equal('shippedAt' in result.patch, false);
  assert.equal(result.patch.trackingNumber, 'CORRECTED123');
});

test('enteredShipped is false for a transition that does not enter shipped at all', () => {
  const result = buildAdminOrderPatch({ orderStatus: 'received' }, { orderStatus: 'processing' });
  assert.equal(result.ok, true);
  assert.equal(result.enteredShipped, false);
});

// ---- buildAdminOrderPatch: tracking validation ----

test('rejects an oversized or blank carrier/trackingNumber when supplied', () => {
  const blank = buildAdminOrderPatch({ orderStatus: 'received' }, { orderStatus: 'shipped', carrier: '   ' });
  assert.equal(blank.ok, false);

  const oversized = buildAdminOrderPatch(
    { orderStatus: 'received' },
    { orderStatus: 'shipped', trackingNumber: 'x'.repeat(200) },
  );
  assert.equal(oversized.ok, false);
});

test('allows shipping with no carrier/trackingNumber at all — never required', () => {
  const result = buildAdminOrderPatch({ orderStatus: 'received' }, { orderStatus: 'shipped' });
  assert.equal(result.ok, true);
  assert.equal('carrier' in result.patch, false);
  assert.equal('trackingNumber' in result.patch, false);
});

// ---- buildOrderStatusMatchCondition ----

test('matches on field-absence for a legacy order with no orderStatus, not the literal string "received"', () => {
  assert.deepEqual(buildOrderStatusMatchCondition(undefined), { orderStatus: { $exists: false } });
  assert.deepEqual(buildOrderStatusMatchCondition(null), { orderStatus: { $exists: false } });
});

test('matches on the exact raw status value when one is present', () => {
  assert.deepEqual(buildOrderStatusMatchCondition('shipped'), { orderStatus: 'shipped' });
});
