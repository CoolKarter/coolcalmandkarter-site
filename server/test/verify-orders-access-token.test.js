'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyOrdersAccessToken } = require('../lib/verify-orders-access-token');
const { hashToken } = require('../lib/secure-token');
const { createFakeOrderAccessTokenModel } = require('./helpers/fake-token-model');

const RAW_TOKEN = 'f'.repeat(64);
const NOW = new Date('2026-08-08T12:00:00Z');

function seedValidToken(overrides = {}) {
  return {
    tokenHash: hashToken(RAW_TOKEN),
    emailNormalized: 'buyer@example.com',
    createdAt: new Date('2026-08-08T11:50:00Z'),
    expiresAt: new Date('2026-08-08T12:05:00Z'), // 15 min after createdAt
    usedAt: null,
    ...overrides,
  };
}

test('a correct, unexpired, unused token verifies successfully and returns the associated email', async () => {
  const OrderAccessTokenModel = createFakeOrderAccessTokenModel({ existing: [seedValidToken()] });
  const result = await verifyOrdersAccessToken({ token: RAW_TOKEN, OrderAccessTokenModel, now: NOW });

  assert.equal(result.ok, true);
  assert.equal(result.emailNormalized, 'buyer@example.com');
});

test('marks the token used (usedAt set) upon successful verification', async () => {
  const OrderAccessTokenModel = createFakeOrderAccessTokenModel({ existing: [seedValidToken()] });
  await verifyOrdersAccessToken({ token: RAW_TOKEN, OrderAccessTokenModel, now: NOW });

  assert.equal(OrderAccessTokenModel.__store[0].usedAt.getTime(), NOW.getTime());
});

test('rejects an invalid (unknown) token', async () => {
  const OrderAccessTokenModel = createFakeOrderAccessTokenModel({ existing: [seedValidToken()] });
  const result = await verifyOrdersAccessToken({ token: 'a'.repeat(64), OrderAccessTokenModel, now: NOW });
  assert.equal(result.ok, false);
});

test('rejects a missing/empty token without throwing', async () => {
  const OrderAccessTokenModel = createFakeOrderAccessTokenModel();
  const result = await verifyOrdersAccessToken({ token: undefined, OrderAccessTokenModel, now: NOW });
  assert.equal(result.ok, false);
});

test('rejects an expired token', async () => {
  const OrderAccessTokenModel = createFakeOrderAccessTokenModel({
    existing: [seedValidToken({ expiresAt: new Date('2026-08-08T11:59:00Z') })], // expired 1 min before `now`
  });
  const result = await verifyOrdersAccessToken({ token: RAW_TOKEN, OrderAccessTokenModel, now: NOW });
  assert.equal(result.ok, false);
});

test('rejects an already-used token', async () => {
  const OrderAccessTokenModel = createFakeOrderAccessTokenModel({
    existing: [seedValidToken({ usedAt: new Date('2026-08-08T11:55:00Z') })],
  });
  const result = await verifyOrdersAccessToken({ token: RAW_TOKEN, OrderAccessTokenModel, now: NOW });
  assert.equal(result.ok, false);
});

test('expired, already-used, and invalid tokens all produce the identical failure shape — no distinguishing information', async () => {
  const expiredModel = createFakeOrderAccessTokenModel({ existing: [seedValidToken({ expiresAt: new Date('2020-01-01') })] });
  const usedModel = createFakeOrderAccessTokenModel({ existing: [seedValidToken({ usedAt: new Date('2020-01-01') })] });
  const invalidModel = createFakeOrderAccessTokenModel();

  const expiredResult = await verifyOrdersAccessToken({ token: RAW_TOKEN, OrderAccessTokenModel: expiredModel, now: NOW });
  const usedResult = await verifyOrdersAccessToken({ token: RAW_TOKEN, OrderAccessTokenModel: usedModel, now: NOW });
  const invalidResult = await verifyOrdersAccessToken({ token: 'z'.repeat(64), OrderAccessTokenModel: invalidModel, now: NOW });

  assert.deepEqual(expiredResult, { ok: false });
  assert.deepEqual(usedResult, { ok: false });
  assert.deepEqual(invalidResult, { ok: false });
});

// ---- The most important test in this file ----

test('two near-simultaneous verification attempts for the SAME token: exactly one succeeds, the other fails — atomic one-time consumption', async () => {
  const OrderAccessTokenModel = createFakeOrderAccessTokenModel({ existing: [seedValidToken()] });

  const [first, second] = await Promise.all([
    verifyOrdersAccessToken({ token: RAW_TOKEN, OrderAccessTokenModel, now: NOW }),
    verifyOrdersAccessToken({ token: RAW_TOKEN, OrderAccessTokenModel, now: NOW }),
  ]);

  const successes = [first, second].filter((r) => r.ok === true);
  const failures = [first, second].filter((r) => r.ok === false);

  assert.equal(successes.length, 1, 'expected exactly one of the two concurrent attempts to succeed');
  assert.equal(failures.length, 1, 'expected exactly one of the two concurrent attempts to fail');
  assert.equal(OrderAccessTokenModel.__store.length, 1); // still only one token document, correctly marked used once
});

test('running ten concurrent verification attempts for the same token still yields exactly one success', async () => {
  const OrderAccessTokenModel = createFakeOrderAccessTokenModel({ existing: [seedValidToken()] });

  const results = await Promise.all(
    Array.from({ length: 10 }, () => verifyOrdersAccessToken({ token: RAW_TOKEN, OrderAccessTokenModel, now: NOW })),
  );

  const successes = results.filter((r) => r.ok === true);
  assert.equal(successes.length, 1);
});
