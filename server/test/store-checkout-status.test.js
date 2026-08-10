'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isStoreCheckoutEnabled } = require('../lib/store-checkout-status');

test('the exact string "true" enables checkout', () => {
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

test('near-miss values all fail closed — this is a strict, case-sensitive, exact match only', () => {
  for (const value of ['TRUE', 'True', '1', 'yes', 'on', ' true', 'true ', 'true\n']) {
    assert.equal(isStoreCheckoutEnabled(value), false, `expected "${value}" to fail closed`);
  }
});

test('non-string values fail closed rather than throwing', () => {
  for (const value of [null, 0, 1, true, false, {}, []]) {
    assert.equal(isStoreCheckoutEnabled(value), false);
  }
});
