import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMyOrdersSessionStatus, extractMagicLinkToken } from '../src/lib/orders-access-response.js';

test('200 classifies as authenticated', () => {
  assert.equal(classifyMyOrdersSessionStatus(200), 'authenticated');
});

test('401 classifies as signed-out', () => {
  assert.equal(classifyMyOrdersSessionStatus(401), 'signed-out');
});

test('any other status (500, 404, 0, etc.) classifies as a generic error state, never as signed-out or authenticated', () => {
  assert.equal(classifyMyOrdersSessionStatus(500), 'error');
  assert.equal(classifyMyOrdersSessionStatus(404), 'error');
  assert.equal(classifyMyOrdersSessionStatus(0), 'error');
  assert.equal(classifyMyOrdersSessionStatus(undefined), 'error');
});

test('extractMagicLinkToken reads the token from a fragment string', () => {
  assert.equal(extractMagicLinkToken('#token=abc123'), 'abc123');
});

test('extractMagicLinkToken works with or without the leading #', () => {
  assert.equal(extractMagicLinkToken('token=abc123'), 'abc123');
});

test('extractMagicLinkToken returns null for an empty or missing fragment', () => {
  assert.equal(extractMagicLinkToken(''), null);
  assert.equal(extractMagicLinkToken('#'), null);
  assert.equal(extractMagicLinkToken(undefined), null);
  assert.equal(extractMagicLinkToken(null), null);
});

test('extractMagicLinkToken returns null when there is no token key', () => {
  assert.equal(extractMagicLinkToken('#other=value'), null);
});

test('extractMagicLinkToken trims incidental whitespace', () => {
  assert.equal(extractMagicLinkToken('#token=  abc123  '), 'abc123');
});

test('extractMagicLinkToken handles a real 64-char hex token', () => {
  const token = 'f'.repeat(64);
  assert.equal(extractMagicLinkToken(`#token=${token}`), token);
});
