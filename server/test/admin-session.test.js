'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdminSession, authenticateAdminSession, deleteAdminSession, ADMIN_SESSION_MAX_AGE_MS } = require('../lib/admin-session');
const { hashToken } = require('../lib/secure-token');
// AdminSession's schema (sessionTokenHash/createdAt/expiresAt) is
// structurally identical to CustomerSession's minus emailNormalized, so
// the same fake model faithfully stands in for it — see
// fake-token-model.js's header for why its findOneAndUpdate/findOne
// behavior is a faithful stand-in for MongoDB's own semantics.
const { createFakeCustomerSessionModel } = require('./helpers/fake-token-model');

test('creates a session with an independent random token — only the hash is persisted', async () => {
  const AdminSessionModel = createFakeCustomerSessionModel();
  const { rawToken } = await createAdminSession({ AdminSessionModel });

  assert.equal(typeof rawToken, 'string');
  assert.equal(rawToken.length, 64); // matches secure-token's 256-bit hex output

  assert.equal(AdminSessionModel.__store.length, 1);
  assert.equal(AdminSessionModel.__store[0].sessionTokenHash, hashToken(rawToken));
  assert.equal('sessionToken' in AdminSessionModel.__store[0], false); // no raw-token field at all
  assert.notEqual(AdminSessionModel.__store[0].sessionTokenHash, rawToken);
});

test('never stores a username or password field on the session document', async () => {
  const AdminSessionModel = createFakeCustomerSessionModel();
  await createAdminSession({ AdminSessionModel });

  const doc = AdminSessionModel.__store[0];
  assert.equal('username' in doc, false);
  assert.equal('password' in doc, false);
  assert.equal('adminPassword' in doc, false);
});

test('sets expiresAt exactly 8 hours from `now`, fixed', async () => {
  const AdminSessionModel = createFakeCustomerSessionModel();
  const now = new Date('2026-08-08T00:00:00Z');
  const { expiresAt } = await createAdminSession({ AdminSessionModel, now });

  const expected = new Date('2026-08-08T08:00:00Z');
  assert.equal(expiresAt.getTime(), expected.getTime());
  assert.equal(ADMIN_SESSION_MAX_AGE_MS, 8 * 60 * 60 * 1000);
});

test('the admin session lifetime is shorter than the customer session lifetime', () => {
  const { SESSION_MAX_AGE_MS: CUSTOMER_SESSION_MAX_AGE_MS } = require('../lib/session-cookie');
  assert.ok(ADMIN_SESSION_MAX_AGE_MS < CUSTOMER_SESSION_MAX_AGE_MS);
});

test('authenticates a valid, unexpired session', async () => {
  const AdminSessionModel = createFakeCustomerSessionModel();
  const now = new Date('2026-08-08T00:00:00Z');
  const { rawToken } = await createAdminSession({ AdminSessionModel, now });

  const result = await authenticateAdminSession({ rawToken, AdminSessionModel, now });
  assert.equal(result.ok, true);
});

test('rejects a missing/undefined token', async () => {
  const AdminSessionModel = createFakeCustomerSessionModel();
  const result = await authenticateAdminSession({ rawToken: undefined, AdminSessionModel });
  assert.equal(result.ok, false);
});

test('rejects an unknown token', async () => {
  const AdminSessionModel = createFakeCustomerSessionModel();
  const result = await authenticateAdminSession({ rawToken: 'not-a-real-token', AdminSessionModel });
  assert.equal(result.ok, false);
});

test('rejects an expired session', async () => {
  const AdminSessionModel = createFakeCustomerSessionModel();
  const createdAt = new Date('2026-08-08T00:00:00Z');
  const { rawToken } = await createAdminSession({ AdminSessionModel, now: createdAt });

  const wellAfterExpiry = new Date('2026-08-09T00:00:00Z'); // > 8 hours later
  const result = await authenticateAdminSession({ rawToken, AdminSessionModel, now: wellAfterExpiry });
  assert.equal(result.ok, false);
});

test('authenticating a request never extends the session (fixed lifetime, not sliding)', async () => {
  const AdminSessionModel = createFakeCustomerSessionModel();
  const createdAt = new Date('2026-08-08T00:00:00Z');
  const { rawToken, expiresAt: originalExpiresAt } = await createAdminSession({ AdminSessionModel, now: createdAt });

  await authenticateAdminSession({ rawToken, AdminSessionModel, now: new Date('2026-08-08T04:00:00Z') });

  assert.equal(AdminSessionModel.__store[0].expiresAt.getTime(), originalExpiresAt.getTime());
});

test('logout deletes the server-side session', async () => {
  const AdminSessionModel = createFakeCustomerSessionModel();
  const { rawToken } = await createAdminSession({ AdminSessionModel });

  const result = await deleteAdminSession({ rawToken, AdminSessionModel });
  assert.equal(result.deleted, true);
  assert.equal(AdminSessionModel.__store.length, 0);
});

test('a session deleted by logout can no longer authenticate', async () => {
  const AdminSessionModel = createFakeCustomerSessionModel();
  const { rawToken } = await createAdminSession({ AdminSessionModel });
  await deleteAdminSession({ rawToken, AdminSessionModel });

  const result = await authenticateAdminSession({ rawToken, AdminSessionModel });
  assert.equal(result.ok, false);
});

test('logout is idempotent — deleting an already-deleted/nonexistent session is a safe no-op, not an error', async () => {
  const AdminSessionModel = createFakeCustomerSessionModel();
  const result = await deleteAdminSession({ rawToken: 'never-existed', AdminSessionModel });
  assert.equal(result.deleted, false);
});

test('logout with no token at all is a safe no-op', async () => {
  const AdminSessionModel = createFakeCustomerSessionModel();
  const result = await deleteAdminSession({ rawToken: undefined, AdminSessionModel });
  assert.equal(result.deleted, false);
});
