'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateContactRequest,
  MAX_NAME_LENGTH,
  MAX_REASON_LENGTH,
  MAX_SUBJECT_LENGTH,
  MAX_MESSAGE_LENGTH,
} = require('../lib/validate-contact-request');

function buildValidBody(overrides = {}) {
  return {
    name: 'Jamie Buyer',
    email: 'jamie@example.com',
    reason: 'general',
    subject: 'A question about my order',
    message: 'Hi, I had a question about shipping.',
    ...overrides,
  };
}

test('accepts a valid, complete request — matching the real frontend contract exactly', () => {
  const result = validateContactRequest(buildValidBody());
  assert.equal(result.ok, true);
  assert.equal(result.name, 'Jamie Buyer');
  assert.equal(result.email, 'jamie@example.com');
  assert.equal(result.reason, 'general');
  assert.equal(result.subject, 'A question about my order');
  assert.equal(result.message, 'Hi, I had a question about shipping.');
});

test('trims incidental whitespace from every field', () => {
  const result = validateContactRequest(buildValidBody({ name: '  Jamie Buyer  ', subject: '  Subject  ', message: '  Message  ' }));
  assert.equal(result.name, 'Jamie Buyer');
  assert.equal(result.subject, 'Subject');
  assert.equal(result.message, 'Message');
});

test('normalizes email the same way the rest of the app does (trim + lowercase)', () => {
  const result = validateContactRequest(buildValidBody({ email: '  Jamie@Example.com  ' }));
  assert.equal(result.ok, true);
  assert.equal(result.email, 'jamie@example.com');
});

test('rejects a missing/blank name', () => {
  assert.equal(validateContactRequest(buildValidBody({ name: undefined })).ok, false);
  assert.equal(validateContactRequest(buildValidBody({ name: '   ' })).ok, false);
});

test('rejects a malformed email using the same validation as the rest of the app', () => {
  const result = validateContactRequest(buildValidBody({ email: 'not-an-email' }));
  assert.equal(result.ok, false);
  assert.match(result.error, /valid email/i);
});

test('rejects a missing email', () => {
  assert.equal(validateContactRequest(buildValidBody({ email: undefined })).ok, false);
});

test('rejects a missing/blank subject', () => {
  assert.equal(validateContactRequest(buildValidBody({ subject: undefined })).ok, false);
  assert.equal(validateContactRequest(buildValidBody({ subject: '' })).ok, false);
});

test('rejects a missing/blank message', () => {
  assert.equal(validateContactRequest(buildValidBody({ message: undefined })).ok, false);
  assert.equal(validateContactRequest(buildValidBody({ message: '' })).ok, false);
});

test('reason is optional — a request without it is still accepted (a direct API call, not the real form)', () => {
  const result = validateContactRequest(buildValidBody({ reason: undefined }));
  assert.equal(result.ok, true);
  assert.equal(result.reason, undefined);
});

test('rejects an oversized name', () => {
  const result = validateContactRequest(buildValidBody({ name: 'x'.repeat(MAX_NAME_LENGTH + 1) }));
  assert.equal(result.ok, false);
  assert.match(result.error, /name/i);
});

test('rejects an oversized reason', () => {
  const result = validateContactRequest(buildValidBody({ reason: 'x'.repeat(MAX_REASON_LENGTH + 1) }));
  assert.equal(result.ok, false);
});

test('rejects an oversized subject', () => {
  const result = validateContactRequest(buildValidBody({ subject: 'x'.repeat(MAX_SUBJECT_LENGTH + 1) }));
  assert.equal(result.ok, false);
  assert.match(result.error, /subject/i);
});

test('rejects an oversized message', () => {
  const result = validateContactRequest(buildValidBody({ message: 'x'.repeat(MAX_MESSAGE_LENGTH + 1) }));
  assert.equal(result.ok, false);
  assert.match(result.error, /message/i);
});

test('accepts a message right at the maximum length (boundary, not off-by-one)', () => {
  const result = validateContactRequest(buildValidBody({ message: 'x'.repeat(MAX_MESSAGE_LENGTH) }));
  assert.equal(result.ok, true);
});

test('does not over-restrict a normal, realistically-long customer message', () => {
  const longButNormal = 'I really loved the Florida Beach and Baby book! '.repeat(20); // ~1000 chars
  const result = validateContactRequest(buildValidBody({ message: longButNormal }));
  assert.equal(result.ok, true);
});

test('rejects a non-object body', () => {
  assert.equal(validateContactRequest(null).ok, false);
  assert.equal(validateContactRequest(undefined).ok, false);
  assert.equal(validateContactRequest('a string').ok, false);
  assert.equal(validateContactRequest([]).ok, false);
});

test('rejects a non-string field rather than coercing it', () => {
  const result = validateContactRequest(buildValidBody({ name: 12345 }));
  assert.equal(result.ok, false);
});
