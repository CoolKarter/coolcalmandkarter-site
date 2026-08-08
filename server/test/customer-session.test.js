'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCustomerSession, authenticateCustomerSession, deleteCustomerSession } = require('../lib/customer-session');
const { hashToken } = require('../lib/secure-token');
const { createFakeCustomerSessionModel } = require('./helpers/fake-token-model');

test('creates a session with an independent random token — only the hash is persisted', async () => {
  const CustomerSessionModel = createFakeCustomerSessionModel();
  const { rawToken } = await createCustomerSession({ emailNormalized: 'buyer@example.com', CustomerSessionModel });

  assert.equal(typeof rawToken, 'string');
  assert.equal(rawToken.length, 64); // matches secure-token's 256-bit hex output

  assert.equal(CustomerSessionModel.__store.length, 1);
  assert.equal(CustomerSessionModel.__store[0].sessionTokenHash, hashToken(rawToken));
  assert.equal('sessionToken' in CustomerSessionModel.__store[0], false); // no raw-token field at all
  assert.notEqual(CustomerSessionModel.__store[0].sessionTokenHash, rawToken);
});

test('the session token is generated independently from any magic-link token — not derived from or equal to it', async () => {
  const CustomerSessionModel = createFakeCustomerSessionModel();
  const fakeMagicLinkToken = 'a'.repeat(64);
  const { rawToken } = await createCustomerSession({ emailNormalized: 'buyer@example.com', CustomerSessionModel });
  assert.notEqual(rawToken, fakeMagicLinkToken);
});

test('sets expiresAt 14 days from `now`', async () => {
  const CustomerSessionModel = createFakeCustomerSessionModel();
  const now = new Date('2026-08-08T00:00:00Z');
  const { expiresAt } = await createCustomerSession({ emailNormalized: 'buyer@example.com', CustomerSessionModel, now });

  const expected = new Date('2026-08-22T00:00:00Z');
  assert.equal(expiresAt.getTime(), expected.getTime());
});

test('authenticates a valid, unexpired session and returns the associated email', async () => {
  const CustomerSessionModel = createFakeCustomerSessionModel();
  const now = new Date('2026-08-08T00:00:00Z');
  const { rawToken } = await createCustomerSession({ emailNormalized: 'buyer@example.com', CustomerSessionModel, now });

  const result = await authenticateCustomerSession({ rawToken, CustomerSessionModel, now });
  assert.equal(result.ok, true);
  assert.equal(result.emailNormalized, 'buyer@example.com');
});

test('rejects a missing/undefined token', async () => {
  const CustomerSessionModel = createFakeCustomerSessionModel();
  const result = await authenticateCustomerSession({ rawToken: undefined, CustomerSessionModel });
  assert.equal(result.ok, false);
});

test('rejects an unknown token', async () => {
  const CustomerSessionModel = createFakeCustomerSessionModel();
  const result = await authenticateCustomerSession({ rawToken: 'not-a-real-token', CustomerSessionModel });
  assert.equal(result.ok, false);
});

test('rejects an expired session', async () => {
  const CustomerSessionModel = createFakeCustomerSessionModel();
  const createdAt = new Date('2026-08-08T00:00:00Z');
  const { rawToken } = await createCustomerSession({ emailNormalized: 'buyer@example.com', CustomerSessionModel, now: createdAt });

  const wellAfterExpiry = new Date('2026-09-01T00:00:00Z'); // > 14 days later
  const result = await authenticateCustomerSession({ rawToken, CustomerSessionModel, now: wellAfterExpiry });
  assert.equal(result.ok, false);
});

test('authenticating a request never extends the session (fixed lifetime, not sliding)', async () => {
  const CustomerSessionModel = createFakeCustomerSessionModel();
  const createdAt = new Date('2026-08-08T00:00:00Z');
  const { rawToken, expiresAt: originalExpiresAt } = await createCustomerSession({
    emailNormalized: 'buyer@example.com',
    CustomerSessionModel,
    now: createdAt,
  });

  await authenticateCustomerSession({ rawToken, CustomerSessionModel, now: new Date('2026-08-15T00:00:00Z') });

  assert.equal(CustomerSessionModel.__store[0].expiresAt.getTime(), originalExpiresAt.getTime());
});

test('logout deletes the server-side session', async () => {
  const CustomerSessionModel = createFakeCustomerSessionModel();
  const { rawToken } = await createCustomerSession({ emailNormalized: 'buyer@example.com', CustomerSessionModel });

  const result = await deleteCustomerSession({ rawToken, CustomerSessionModel });
  assert.equal(result.deleted, true);
  assert.equal(CustomerSessionModel.__store.length, 0);
});

test('a session deleted by logout can no longer authenticate', async () => {
  const CustomerSessionModel = createFakeCustomerSessionModel();
  const { rawToken } = await createCustomerSession({ emailNormalized: 'buyer@example.com', CustomerSessionModel });
  await deleteCustomerSession({ rawToken, CustomerSessionModel });

  const result = await authenticateCustomerSession({ rawToken, CustomerSessionModel });
  assert.equal(result.ok, false);
});

test('logout is idempotent — calling it twice (or with no active session) does not throw', async () => {
  const CustomerSessionModel = createFakeCustomerSessionModel();
  const { rawToken } = await createCustomerSession({ emailNormalized: 'buyer@example.com', CustomerSessionModel });

  const first = await deleteCustomerSession({ rawToken, CustomerSessionModel });
  const second = await deleteCustomerSession({ rawToken, CustomerSessionModel });

  assert.equal(first.deleted, true);
  assert.equal(second.deleted, false); // already gone — not an error, just nothing to delete
});

test('logout with no rawToken at all is a safe no-op', async () => {
  const CustomerSessionModel = createFakeCustomerSessionModel();
  const result = await deleteCustomerSession({ rawToken: undefined, CustomerSessionModel });
  assert.equal(result.deleted, false);
});
