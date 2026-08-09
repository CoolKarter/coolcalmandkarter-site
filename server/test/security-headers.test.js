'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { securityHeaders, REFERRER_POLICY } = require('../lib/security-headers');

function fakeRes() {
  const headers = {};
  return {
    headers,
    setHeader(name, value) {
      headers[name] = value;
    },
  };
}

test('sets X-Content-Type-Options: nosniff', () => {
  const res = fakeRes();
  securityHeaders({}, res, () => {});
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
});

test('sets X-Frame-Options: DENY', () => {
  const res = fakeRes();
  securityHeaders({}, res, () => {});
  assert.equal(res.headers['X-Frame-Options'], 'DENY');
});

test('sets a real, non-empty Referrer-Policy value', () => {
  const res = fakeRes();
  securityHeaders({}, res, () => {});
  assert.equal(res.headers['Referrer-Policy'], REFERRER_POLICY);
  assert.equal(typeof REFERRER_POLICY, 'string');
  assert.notEqual(REFERRER_POLICY.trim(), '');
});

test('calls next() exactly once, synchronously, so this never stalls the request', () => {
  const res = fakeRes();
  let callCount = 0;
  securityHeaders({}, res, () => { callCount += 1; });
  assert.equal(callCount, 1);
});

test('sets exactly the three documented headers, nothing else', () => {
  const res = fakeRes();
  securityHeaders({}, res, () => {});
  assert.deepEqual(Object.keys(res.headers).sort(), ['Referrer-Policy', 'X-Content-Type-Options', 'X-Frame-Options']);
});
