'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildErrorResponse, isJsonParseError } = require('../lib/error-response');

function makeJsonParseError() {
  const err = new SyntaxError('Unexpected token i in JSON at position 1');
  err.type = 'entity.parse.failed';
  err.status = 400;
  err.statusCode = 400;
  err.expose = true;
  err.body = '{invalid json';
  return err;
}

// ---- isJsonParseError ----

test('recognizes the exact shape express.json()/body-parser throws for malformed JSON', () => {
  assert.equal(isJsonParseError(makeJsonParseError()), true);
});

test('does not misclassify an unrelated SyntaxError with no .type as a JSON parse error', () => {
  assert.equal(isJsonParseError(new SyntaxError('some other syntax error')), false);
});

test('does not misclassify a plain Error carrying an unrelated .type string', () => {
  const err = new Error('boom');
  err.type = 'entity.parse.failed';
  assert.equal(isJsonParseError(err), false); // not actually a SyntaxError
});

test('never throws on null/undefined/non-error input', () => {
  assert.equal(isJsonParseError(null), false);
  assert.equal(isJsonParseError(undefined), false);
  assert.equal(isJsonParseError({}), false);
});

// ---- buildErrorResponse ----

test('a malformed-JSON error produces a clean 400 with a generic, actionable message', () => {
  const result = buildErrorResponse(makeJsonParseError());
  assert.deepEqual(result, { status: 400, body: { error: 'Invalid request body.' } });
});

test('a generic unexpected error produces a generic 500 — never the real message', () => {
  const err = new Error('ENOENT: no such file or directory, open \'/etc/secret-config.json\'');
  const result = buildErrorResponse(err);
  assert.equal(result.status, 500);
  assert.equal(JSON.stringify(result).includes('ENOENT'), false);
  assert.equal(JSON.stringify(result).includes('/etc/secret-config'), false);
});

test('a Mongo-shaped error never leaks its message/fields into the response', () => {
  const mongoErr = new Error('E11000 duplicate key error collection: prod.orders index: stripeSessionId_1');
  mongoErr.code = 11000;
  mongoErr.keyPattern = { stripeSessionId: 1 };
  const result = buildErrorResponse(mongoErr);
  const serialized = JSON.stringify(result);
  assert.equal(result.status, 500);
  assert.ok(!serialized.includes('E11000'));
  assert.ok(!serialized.includes('stripeSessionId'));
});

test('a Stripe-shaped error never leaks its message into the response', () => {
  const stripeErr = new Error('No such price: \'price_invalid123\'');
  stripeErr.type = 'StripeInvalidRequestError';
  const result = buildErrorResponse(stripeErr);
  assert.ok(!JSON.stringify(result).includes('price_invalid123'));
});

test('never includes a stack trace in the response body', () => {
  const err = new Error('boom');
  const result = buildErrorResponse(err);
  assert.equal(JSON.stringify(result).includes('at '), false); // stack frames all start with "    at "
  assert.equal('stack' in result.body, false);
});

test('the response body for a generic error contains only a single "error" key', () => {
  const result = buildErrorResponse(new Error('anything'));
  assert.deepEqual(Object.keys(result.body), ['error']);
});
