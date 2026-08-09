'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CONTACT_RATE_LIMIT_WINDOW_MS, CONTACT_RATE_LIMIT_MAX } = require('../lib/contact-rate-limit');

test('rate limit window is 15 minutes', () => {
  assert.equal(CONTACT_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
});

test('rate limit max is within the specified 5-10 range', () => {
  assert.ok(CONTACT_RATE_LIMIT_MAX >= 5 && CONTACT_RATE_LIMIT_MAX <= 10);
});
