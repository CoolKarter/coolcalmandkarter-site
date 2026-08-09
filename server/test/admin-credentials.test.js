'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyAdminCredentials, safeStringEqual, ADMIN_USERNAME } = require('../lib/admin-credentials');

test('correct username and password are accepted', () => {
  const result = verifyAdminCredentials({ username: 'admin', password: 'correct-horse', adminPassword: 'correct-horse' });
  assert.equal(result.ok, true);
});

test('the username is fixed to "admin"', () => {
  assert.equal(ADMIN_USERNAME, 'admin');
});

test('wrong username is rejected', () => {
  const result = verifyAdminCredentials({ username: 'someone-else', password: 'correct-horse', adminPassword: 'correct-horse' });
  assert.equal(result.ok, false);
  assert.equal(result.configError, undefined);
});

test('wrong password is rejected', () => {
  const result = verifyAdminCredentials({ username: 'admin', password: 'wrong', adminPassword: 'correct-horse' });
  assert.equal(result.ok, false);
});

test('missing/empty ADMIN_PASSWORD fails CLOSED with configError — never authenticates, never throws', () => {
  const missing = verifyAdminCredentials({ username: 'admin', password: 'anything', adminPassword: undefined });
  assert.equal(missing.ok, false);
  assert.equal(missing.configError, true);

  const empty = verifyAdminCredentials({ username: 'admin', password: 'anything', adminPassword: '' });
  assert.equal(empty.ok, false);
  assert.equal(empty.configError, true);
});

test('never throws for non-string username/password input', () => {
  assert.doesNotThrow(() => verifyAdminCredentials({ username: undefined, password: undefined, adminPassword: 'x' }));
  assert.doesNotThrow(() => verifyAdminCredentials({ username: 123, password: {}, adminPassword: 'x' }));
  const result = verifyAdminCredentials({ username: 123, password: {}, adminPassword: 'x' });
  assert.equal(result.ok, false);
});

test('the result never contains the submitted or configured password in any field', () => {
  const result = verifyAdminCredentials({ username: 'admin', password: 'super-secret-password', adminPassword: 'super-secret-password' });
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('super-secret-password'));
});

// ---- safeStringEqual ----

test('safeStringEqual is true for identical strings', () => {
  assert.equal(safeStringEqual('hello', 'hello'), true);
});

test('safeStringEqual is false for different strings, including different lengths', () => {
  assert.equal(safeStringEqual('hello', 'world'), false);
  assert.equal(safeStringEqual('short', 'a-much-longer-string'), false);
});

test('safeStringEqual never throws on differing-length input (the reason crypto.timingSafeEqual is not used directly on raw input)', () => {
  assert.doesNotThrow(() => safeStringEqual('a', 'a-very-different-and-much-longer-string'));
});
