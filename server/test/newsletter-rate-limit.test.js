'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { NEWSLETTER_RATE_LIMIT_WINDOW_MS, NEWSLETTER_RATE_LIMIT_MAX } = require('../lib/newsletter-rate-limit');

test('rate limit window is 15 minutes', () => {
  assert.equal(NEWSLETTER_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
});

test('rate limit max is a small, reasonable positive number', () => {
  assert.ok(NEWSLETTER_RATE_LIMIT_MAX > 0 && NEWSLETTER_RATE_LIMIT_MAX <= 20);
});
