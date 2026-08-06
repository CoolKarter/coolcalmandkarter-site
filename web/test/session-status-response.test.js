import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSessionStatusResponse, VERIFICATION_FAILURE } from '../src/lib/session-status-response.js';

test('accepts a valid verified response', () => {
  const result = parseSessionStatusResponse(200, {
    verified: true,
    paymentStatus: 'paid',
    sessionStatus: 'complete',
  });
  assert.deepEqual(result, { verified: true, paymentStatus: 'paid', sessionStatus: 'complete' });
});

test('accepts a valid unverified response', () => {
  const result = parseSessionStatusResponse(200, {
    verified: false,
    paymentStatus: 'unpaid',
    sessionStatus: 'open',
  });
  assert.deepEqual(result, { verified: false, paymentStatus: 'unpaid', sessionStatus: 'open' });
});

test('treats a missing "verified" field as a failure', () => {
  const result = parseSessionStatusResponse(200, { paymentStatus: 'paid', sessionStatus: 'complete' });
  assert.deepEqual(result, VERIFICATION_FAILURE);
});

test('treats a non-boolean "verified" field as a failure', () => {
  assert.deepEqual(parseSessionStatusResponse(200, { verified: 'true' }), VERIFICATION_FAILURE);
  assert.deepEqual(parseSessionStatusResponse(200, { verified: 1 }), VERIFICATION_FAILURE);
});

test('treats a non-object response body as a failure', () => {
  assert.deepEqual(parseSessionStatusResponse(200, null), VERIFICATION_FAILURE);
  assert.deepEqual(parseSessionStatusResponse(200, undefined), VERIFICATION_FAILURE);
  assert.deepEqual(parseSessionStatusResponse(200, 'nope'), VERIFICATION_FAILURE);
  assert.deepEqual(parseSessionStatusResponse(200, [true]), VERIFICATION_FAILURE);
});

test('treats a non-2xx status as a failure even if the body looks valid', () => {
  const result = parseSessionStatusResponse(404, { verified: true, paymentStatus: 'paid', sessionStatus: 'complete' });
  assert.deepEqual(result, VERIFICATION_FAILURE);
});

test('treats a 500 as a failure', () => {
  assert.deepEqual(parseSessionStatusResponse(500, { verified: true }), VERIFICATION_FAILURE);
});

test('falls back to null for a missing or malformed paymentStatus/sessionStatus, without failing the whole result', () => {
  const result = parseSessionStatusResponse(200, { verified: true, paymentStatus: 42, sessionStatus: null });
  assert.deepEqual(result, { verified: true, paymentStatus: null, sessionStatus: null });
});
