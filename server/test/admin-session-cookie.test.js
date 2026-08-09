'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getAdminSessionCookieName,
  getAdminSessionCookieOptions,
  setAdminSessionCookie,
  readAdminSessionCookie,
  clearAdminSessionCookie,
  SECURE_COOKIE_NAME,
  INSECURE_COOKIE_NAME,
} = require('../lib/admin-session-cookie');
const { ADMIN_SESSION_MAX_AGE_MS } = require('../lib/admin-session');
const { SECURE_COOKIE_NAME: CUSTOMER_SECURE_COOKIE_NAME } = require('../lib/session-cookie');

function fakeReq({ secure = true, cookies = {} } = {}) {
  return { secure, cookies };
}

function fakeRes() {
  const calls = { cookie: [], clearCookie: [] };
  return {
    calls,
    cookie(name, value, options) {
      calls.cookie.push({ name, value, options });
    },
    clearCookie(name, options) {
      calls.clearCookie.push({ name, options });
    },
  };
}

test('uses the __Host- prefixed name when the connection is genuinely HTTPS', () => {
  assert.equal(getAdminSessionCookieName(fakeReq({ secure: true })), SECURE_COOKIE_NAME);
  assert.match(SECURE_COOKIE_NAME, /^__Host-/);
});

test('falls back to a plain cookie name over plain HTTP (local dev)', () => {
  assert.equal(getAdminSessionCookieName(fakeReq({ secure: false })), INSECURE_COOKIE_NAME);
  assert.ok(!INSECURE_COOKIE_NAME.startsWith('__Host-'));
});

test('the admin session cookie name is completely distinct from the customer session cookie name', () => {
  assert.notEqual(SECURE_COOKIE_NAME, CUSTOMER_SECURE_COOKIE_NAME);
});

test('cookie options are HttpOnly, SameSite=Lax, Path=/, no Domain attribute', () => {
  const options = getAdminSessionCookieOptions(fakeReq({ secure: true }));
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, 'lax');
  assert.equal(options.path, '/');
  assert.equal('domain' in options, false);
});

test("Secure flag matches the connection's actual HTTPS status", () => {
  assert.equal(getAdminSessionCookieOptions(fakeReq({ secure: true })).secure, true);
  assert.equal(getAdminSessionCookieOptions(fakeReq({ secure: false })).secure, false);
});

test('Max-Age matches the fixed 8-hour admin session lifetime', () => {
  const options = getAdminSessionCookieOptions(fakeReq({ secure: true }));
  assert.equal(options.maxAge, ADMIN_SESSION_MAX_AGE_MS);
  assert.equal(ADMIN_SESSION_MAX_AGE_MS, 8 * 60 * 60 * 1000);
});

test('setAdminSessionCookie sets exactly one cookie, under the environment-correct name, with the raw token as its value', () => {
  const req = fakeReq({ secure: true });
  const res = fakeRes();
  setAdminSessionCookie(req, res, 'raw-admin-token-value');

  assert.equal(res.calls.cookie.length, 1);
  assert.equal(res.calls.cookie[0].name, SECURE_COOKIE_NAME);
  assert.equal(res.calls.cookie[0].value, 'raw-admin-token-value');
  assert.equal(res.calls.cookie[0].options.httpOnly, true);
});

test('readAdminSessionCookie reads the value under the environment-correct name', () => {
  const req = fakeReq({ secure: true, cookies: { [SECURE_COOKIE_NAME]: 'abc123' } });
  assert.equal(readAdminSessionCookie(req), 'abc123');
});

test('readAdminSessionCookie returns null when no admin session cookie is present', () => {
  assert.equal(readAdminSessionCookie(fakeReq({ secure: true, cookies: {} })), null);
});

test("readAdminSessionCookie ignores a customer session cookie present on the same request", () => {
  const req = fakeReq({ secure: true, cookies: { [CUSTOMER_SECURE_COOKIE_NAME]: 'customer-token' } });
  assert.equal(readAdminSessionCookie(req), null);
});

test('clearAdminSessionCookie clears the cookie under the same name/attributes it was set with', () => {
  const req = fakeReq({ secure: true });
  const res = fakeRes();
  clearAdminSessionCookie(req, res);

  assert.equal(res.calls.clearCookie.length, 1);
  assert.equal(res.calls.clearCookie[0].name, SECURE_COOKIE_NAME);
});
