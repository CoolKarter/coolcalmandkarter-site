import test from 'node:test';
import assert from 'node:assert/strict';
import { isStoreCheckoutEnabled } from '../src/lib/store-status.js';

// Mirrors server/test/store-checkout-status.test.js exactly — the
// frontend and backend must apply the identical fail-closed parsing
// rule (see web/src/lib/store-status.js and
// server/lib/store-checkout-status.js).

test('the exact string "true" enables checkout UI', () => {
  assert.equal(isStoreCheckoutEnabled('true'), true);
});

test('a missing/undefined value fails closed', () => {
  assert.equal(isStoreCheckoutEnabled(undefined), false);
});

test('the exact string "false" fails closed', () => {
  assert.equal(isStoreCheckoutEnabled('false'), false);
});

test('an empty string fails closed', () => {
  assert.equal(isStoreCheckoutEnabled(''), false);
});

test('near-miss values all fail closed — strict, case-sensitive, exact match only', () => {
  for (const value of ['TRUE', 'True', '1', 'yes', 'on', ' true', 'true ']) {
    assert.equal(isStoreCheckoutEnabled(value), false, `expected "${value}" to fail closed`);
  }
});
