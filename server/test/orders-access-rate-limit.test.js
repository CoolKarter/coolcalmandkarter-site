'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ORDERS_ACCESS_RATE_LIMIT_WINDOW_MS, ORDERS_ACCESS_RATE_LIMIT_MAX } = require('../lib/orders-access-rate-limit');

test('rate limit window is 15 minutes, as specified', () => {
  assert.equal(ORDERS_ACCESS_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
});

test('rate limit max is 5 requests per window, as specified', () => {
  assert.equal(ORDERS_ACCESS_RATE_LIMIT_MAX, 5);
});
