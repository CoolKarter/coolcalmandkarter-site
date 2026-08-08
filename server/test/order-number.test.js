'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { generateOrderNumber, formatDateForOrderNumber } = require('../lib/order-number');

test('generates an order number in the CCK-YYYYMMDD-XXXX format', () => {
  const orderNumber = generateOrderNumber(new Date('2026-08-08T12:00:00Z'));
  assert.match(orderNumber, /^CCK-20260808-[0-9A-F]{4}$/);
});

test('formatDateForOrderNumber pads month/day and uses UTC', () => {
  assert.equal(formatDateForOrderNumber(new Date('2026-01-05T23:59:00Z')), '20260105');
});

test('never exposes a MongoDB ObjectId shape — always the CCK- prefix format', () => {
  const orderNumber = generateOrderNumber();
  assert.ok(orderNumber.startsWith('CCK-'));
  assert.doesNotMatch(orderNumber, /^[0-9a-f]{24}$/i);
});

test('produces distinct suffixes across repeated calls (collisions are possible in principle, not in practice)', () => {
  const generated = new Set();
  for (let i = 0; i < 200; i += 1) {
    generated.add(generateOrderNumber(new Date('2026-08-08T00:00:00Z')));
  }
  // 200 draws from a 65,536-value space landing on zero repeats is the
  // overwhelmingly likely outcome — this is a smoke test for "the suffix
  // actually varies", not a formal collision-probability proof.
  assert.ok(generated.size > 190, `expected close to 200 distinct values, got ${generated.size}`);
});
