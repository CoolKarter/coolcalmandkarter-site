'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeBaseUrl, buildCheckoutRedirectUrls } = require('../lib/frontend-url');

test('normalizeBaseUrl strips a single trailing slash', () => {
  assert.equal(normalizeBaseUrl('https://example.com/'), 'https://example.com');
});

test('normalizeBaseUrl strips multiple trailing slashes', () => {
  assert.equal(normalizeBaseUrl('https://example.com///'), 'https://example.com');
});

test('normalizeBaseUrl leaves a URL with no trailing slash unchanged', () => {
  assert.equal(normalizeBaseUrl('https://example.com'), 'https://example.com');
});

test('buildCheckoutRedirectUrls builds success/cancel URLs from FRONTEND_BASE_URL', () => {
  const result = buildCheckoutRedirectUrls({ FRONTEND_BASE_URL: 'https://staging.example.com/' });
  assert.equal(result.ok, true);
  assert.equal(result.successUrl, 'https://staging.example.com/success?session_id={CHECKOUT_SESSION_ID}');
  assert.equal(result.cancelUrl, 'https://staging.example.com/cancel');
});

test('buildCheckoutRedirectUrls fails closed with no hardcoded fallback when unset', () => {
  const result = buildCheckoutRedirectUrls({});
  assert.equal(result.ok, false);
  assert.match(result.error, /FRONTEND_BASE_URL/);
});

test('buildCheckoutRedirectUrls fails closed on an empty string', () => {
  const result = buildCheckoutRedirectUrls({ FRONTEND_BASE_URL: '   ' });
  assert.equal(result.ok, false);
});
