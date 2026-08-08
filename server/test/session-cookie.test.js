'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getSessionCookieName,
  getSessionCookieOptions,
  setSessionCookie,
  readSessionCookie,
  clearSessionCookie,
  SESSION_MAX_AGE_MS,
  SECURE_COOKIE_NAME,
  INSECURE_COOKIE_NAME,
} = require('../lib/session-cookie');

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

test('uses the __Host- prefixed name when the connection is genuinely HTTPS (staging/production)', () => {
  assert.equal(getSessionCookieName(fakeReq({ secure: true })), SECURE_COOKIE_NAME);
  assert.match(SECURE_COOKIE_NAME, /^__Host-/);
});

test('falls back to a plain cookie name over plain HTTP (local dev) — __Host- cookies are never stored by browsers over http', () => {
  assert.equal(getSessionCookieName(fakeReq({ secure: false })), INSECURE_COOKIE_NAME);
  assert.ok(!INSECURE_COOKIE_NAME.startsWith('__Host-'));
});

test('cookie options are HttpOnly, SameSite=Lax, Path=/, no Domain attribute', () => {
  const options = getSessionCookieOptions(fakeReq({ secure: true }));
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, 'lax');
  assert.equal(options.path, '/');
  assert.equal('domain' in options, false);
});

test('Secure flag matches the connection\'s actual HTTPS status', () => {
  assert.equal(getSessionCookieOptions(fakeReq({ secure: true })).secure, true);
  assert.equal(getSessionCookieOptions(fakeReq({ secure: false })).secure, false);
});

test('Max-Age matches the fixed 14-day session lifetime', () => {
  const options = getSessionCookieOptions(fakeReq({ secure: true }));
  assert.equal(options.maxAge, SESSION_MAX_AGE_MS);
  assert.equal(SESSION_MAX_AGE_MS, 14 * 24 * 60 * 60 * 1000);
});

test('setSessionCookie sets exactly one cookie, under the environment-correct name, with the raw token as its value', () => {
  const req = fakeReq({ secure: true });
  const res = fakeRes();
  setSessionCookie(req, res, 'raw-token-value');

  assert.equal(res.calls.cookie.length, 1);
  assert.equal(res.calls.cookie[0].name, SECURE_COOKIE_NAME);
  assert.equal(res.calls.cookie[0].value, 'raw-token-value');
  assert.equal(res.calls.cookie[0].options.httpOnly, true);
});

test('readSessionCookie reads the value under the environment-correct name', () => {
  const req = fakeReq({ secure: true, cookies: { [SECURE_COOKIE_NAME]: 'abc123' } });
  assert.equal(readSessionCookie(req), 'abc123');
});

test('readSessionCookie returns null when no session cookie is present', () => {
  assert.equal(readSessionCookie(fakeReq({ secure: true, cookies: {} })), null);
});

test('clearSessionCookie clears the cookie under the same name/attributes it was set with', () => {
  const req = fakeReq({ secure: true });
  const res = fakeRes();
  clearSessionCookie(req, res);

  assert.equal(res.calls.clearCookie.length, 1);
  assert.equal(res.calls.clearCookie[0].name, SECURE_COOKIE_NAME);
});
