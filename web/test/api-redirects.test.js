import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApiRedirectsRule } from '../src/lib/api-redirects.js';

test('a staging-style HTTPS origin generates the correct proxy rule', () => {
  const result = buildApiRedirectsRule('https://cool-calm-karter-api-staging.onrender.com');
  assert.equal(result.ok, true);
  assert.equal(result.content, '/api/*  https://cool-calm-karter-api-staging.onrender.com/api/:splat  200\n');
});

test('a trailing slash is handled safely — .origin strips it', () => {
  const result = buildApiRedirectsRule('https://cool-calm-karter-api-staging.onrender.com/');
  assert.equal(result.ok, true);
  assert.equal(result.origin, 'https://cool-calm-karter-api-staging.onrender.com');
  assert.ok(!result.content.includes('.com//api'));
});

test('any accidental path/query on the configured value is stripped down to just the origin', () => {
  const result = buildApiRedirectsRule('https://backend.example.com/some/path?query=1');
  assert.equal(result.ok, true);
  assert.equal(result.origin, 'https://backend.example.com');
});

test('a malformed URL is rejected with a clear error, not silently accepted', () => {
  const result = buildApiRedirectsRule('not-a-url');
  assert.equal(result.ok, false);
  assert.match(result.error, /valid absolute URL/);
});

test('a missing value fails clearly rather than generating a broken/empty proxy', () => {
  assert.equal(buildApiRedirectsRule(undefined).ok, false);
  assert.equal(buildApiRedirectsRule('').ok, false);
  assert.equal(buildApiRedirectsRule('   ').ok, false);
});

test('a non-HTTPS origin is rejected for a production/staging build target', () => {
  const result = buildApiRedirectsRule('http://cool-calm-karter-api-staging.onrender.com');
  assert.equal(result.ok, false);
  assert.match(result.error, /HTTPS/);
});

test('the generated rule always preserves /api/:splat', () => {
  const result = buildApiRedirectsRule('https://backend.example.com');
  assert.match(result.content, /\/api\/\*\s+https:\/\/backend\.example\.com\/api\/:splat\s+200/);
});

test('no backend host is hardcoded — the function produces different output for different input, proving nothing is baked in', () => {
  const staging = buildApiRedirectsRule('https://staging-backend.example.com');
  const production = buildApiRedirectsRule('https://production-backend.example.com');
  assert.notEqual(staging.content, production.content);
  assert.ok(staging.content.includes('staging-backend.example.com'));
  assert.ok(production.content.includes('production-backend.example.com'));
});
