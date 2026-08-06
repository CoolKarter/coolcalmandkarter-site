'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { BASE_ALLOWED_ORIGINS, normalizeOrigin, getAllowedOrigins } = require('../lib/cors-origins');

test('normalizeOrigin extracts just scheme+host+port from a full URL', () => {
  assert.equal(normalizeOrigin('https://staging-site.netlify.app'), 'https://staging-site.netlify.app');
});

test('normalizeOrigin strips a path and query string down to the exact origin only', () => {
  assert.equal(
    normalizeOrigin('https://staging-site.netlify.app/some/path?query=1'),
    'https://staging-site.netlify.app',
  );
});

test('normalizeOrigin ignores a trailing slash', () => {
  assert.equal(normalizeOrigin('https://staging-site.netlify.app/'), 'https://staging-site.netlify.app');
});

test('normalizeOrigin preserves a non-default port', () => {
  assert.equal(normalizeOrigin('http://localhost:4321'), 'http://localhost:4321');
});

test('normalizeOrigin returns null for a missing or empty value', () => {
  assert.equal(normalizeOrigin(undefined), null);
  assert.equal(normalizeOrigin(''), null);
  assert.equal(normalizeOrigin('   '), null);
});

test('normalizeOrigin returns null for a malformed URL', () => {
  assert.equal(normalizeOrigin('not a url'), null);
});

test('normalizeOrigin rejects a non-http(s) protocol', () => {
  assert.equal(normalizeOrigin('ftp://example.com'), null);
  assert.equal(normalizeOrigin('javascript:alert(1)'), null);
});

test('getAllowedOrigins returns exactly the base list when FRONTEND_BASE_URL is unset', () => {
  const origins = getAllowedOrigins({});
  assert.deepEqual(origins, BASE_ALLOWED_ORIGINS);
});

test('getAllowedOrigins adds the exact origin derived from FRONTEND_BASE_URL', () => {
  const origins = getAllowedOrigins({ FRONTEND_BASE_URL: 'https://staging-site.netlify.app/' });
  assert.ok(origins.includes('https://staging-site.netlify.app'));
  assert.equal(origins.length, BASE_ALLOWED_ORIGINS.length + 1);
});

test('getAllowedOrigins does not add a duplicate if FRONTEND_BASE_URL matches an existing base origin', () => {
  const origins = getAllowedOrigins({ FRONTEND_BASE_URL: 'https://coolcalmandkarter.netlify.app' });
  assert.equal(origins.length, BASE_ALLOWED_ORIGINS.length);
});

test('getAllowedOrigins falls back to the base list when FRONTEND_BASE_URL is malformed, without throwing', () => {
  const origins = getAllowedOrigins({ FRONTEND_BASE_URL: 'not-a-url' });
  assert.deepEqual(origins, BASE_ALLOWED_ORIGINS);
});

test('getAllowedOrigins never allows a partial/substring match — only the exact derived origin is added', () => {
  const origins = getAllowedOrigins({ FRONTEND_BASE_URL: 'https://staging-site.netlify.app/api/checkout/session' });
  assert.ok(origins.includes('https://staging-site.netlify.app'));
  assert.ok(!origins.some((o) => o.includes('/api')));
});
