'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { generateSecureToken, hashToken } = require('../lib/secure-token');

test('generates a 256-bit (32-byte) token, hex-encoded to 64 characters', () => {
  const token = generateSecureToken();
  assert.equal(typeof token, 'string');
  assert.equal(token.length, 64);
  assert.match(token, /^[0-9a-f]{64}$/);
});

test('two generated tokens are different', () => {
  const a = generateSecureToken();
  const b = generateSecureToken();
  assert.notEqual(a, b);
});

test('generates many distinct tokens with no collisions across a reasonably large sample', () => {
  const seen = new Set();
  for (let i = 0; i < 1000; i += 1) {
    seen.add(generateSecureToken());
  }
  assert.equal(seen.size, 1000);
});

test('hashToken is deterministic for the same input', () => {
  const token = generateSecureToken();
  assert.equal(hashToken(token), hashToken(token));
});

test('hashToken produces different output for different input', () => {
  const a = generateSecureToken();
  const b = generateSecureToken();
  assert.notEqual(hashToken(a), hashToken(b));
});

test('hashToken output is a fixed-length SHA-256 hex digest, not the raw token itself', () => {
  const token = generateSecureToken();
  const hash = hashToken(token);
  assert.equal(hash.length, 64); // SHA-256 hex digest length
  assert.notEqual(hash, token);
  assert.match(hash, /^[0-9a-f]{64}$/);
});
