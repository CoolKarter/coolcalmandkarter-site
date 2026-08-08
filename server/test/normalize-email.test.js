'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEmail, EMAIL_PATTERN, MAX_EMAIL_LENGTH } = require('../lib/normalize-email');

test('trims whitespace and lowercases', () => {
  const result = normalizeEmail('  Jane.Doe@Example.COM  ');
  assert.equal(result.ok, true);
  assert.equal(result.email, 'jane.doe@example.com');
});

test('capitalization differences normalize to the same value', () => {
  const a = normalizeEmail('Buyer@Example.com');
  const b = normalizeEmail('buyer@EXAMPLE.COM');
  assert.equal(a.email, b.email);
});

test('rejects empty/whitespace-only input', () => {
  assert.equal(normalizeEmail('').ok, false);
  assert.equal(normalizeEmail('   ').ok, false);
});

test('rejects non-string input rather than throwing', () => {
  assert.equal(normalizeEmail(undefined).ok, false);
  assert.equal(normalizeEmail(null).ok, false);
  assert.equal(normalizeEmail(42).ok, false);
  assert.equal(normalizeEmail({}).ok, false);
});

test('rejects clearly malformed email shapes', () => {
  assert.equal(normalizeEmail('not-an-email').ok, false);
  assert.equal(normalizeEmail('missing-domain@').ok, false);
  assert.equal(normalizeEmail('@missing-local.com').ok, false);
  assert.equal(normalizeEmail('no-at-sign.com').ok, false);
});

test('rejects an oversized email', () => {
  const huge = `${'a'.repeat(MAX_EMAIL_LENGTH)}@example.com`;
  assert.equal(normalizeEmail(huge).ok, false);
});

test('accepts an email at exactly the maximum length', () => {
  const local = 'a'.repeat(MAX_EMAIL_LENGTH - '@example.com'.length);
  const email = `${local}@example.com`;
  assert.equal(email.length, MAX_EMAIL_LENGTH);
  assert.equal(normalizeEmail(email).ok, true);
});

test('EMAIL_PATTERN is a fixed literal, never constructed from input — normalizeEmail never builds a RegExp from its argument', () => {
  // A string containing regex metacharacters must be treated as ordinary
  // (invalid) email text, never interpreted as a pattern.
  const result = normalizeEmail('.*@.*');
  assert.equal(result.ok, false);
  assert.ok(EMAIL_PATTERN instanceof RegExp);
});

test('a regex-metacharacter-laden but well-formed-looking email is still just normalized as data, not executed as a pattern', () => {
  const result = normalizeEmail('a+b.c-d@example.com');
  assert.equal(result.ok, true);
  assert.equal(result.email, 'a+b.c-d@example.com');
});
