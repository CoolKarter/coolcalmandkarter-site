'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { processOrdersAccessRequest, GENERIC_RESPONSE } = require('../lib/process-orders-access-request');
const { createFakeOrderAccessTokenModel } = require('./helpers/fake-token-model');

const FRONTEND_BASE_URL = 'https://staging.example.com';

function createFakeOrderModelWithOrders(hasOrders) {
  return {
    findOne: async () => (hasOrders ? { email: 'buyer@example.com' } : null),
  };
}

function fakeSendEmailSucceeds() {
  const calls = [];
  return {
    calls,
    fn: async (payload) => {
      calls.push(payload);
      return { ok: true, id: 'email_test_1' };
    },
  };
}

test('a well-formed email with existing orders creates a token and sends the magic-link email internally', async () => {
  const OrderAccessTokenModel = createFakeOrderAccessTokenModel();
  const email = fakeSendEmailSucceeds();

  const result = await processOrdersAccessRequest({
    email: 'buyer@example.com',
    OrderModel: createFakeOrderModelWithOrders(true),
    OrderAccessTokenModel,
    frontendBaseUrl: FRONTEND_BASE_URL,
    sendEmailFn: email.fn,
  });

  assert.equal(result.ok, true);
  assert.equal(result.internalOutcome, 'sent');
  assert.equal(OrderAccessTokenModel.__store.length, 1);
  assert.equal(email.calls.length, 1);
  assert.equal(email.calls[0].to, 'buyer@example.com');
});

test('a well-formed email with NO existing orders returns the identical public response, but sends nothing', async () => {
  const OrderAccessTokenModel = createFakeOrderAccessTokenModel();
  const email = fakeSendEmailSucceeds();

  const result = await processOrdersAccessRequest({
    email: 'nobody@example.com',
    OrderModel: createFakeOrderModelWithOrders(false),
    OrderAccessTokenModel,
    frontendBaseUrl: FRONTEND_BASE_URL,
    sendEmailFn: email.fn,
  });

  assert.equal(result.ok, GENERIC_RESPONSE.ok);
  assert.equal(result.message, GENERIC_RESPONSE.message);
  assert.equal(OrderAccessTokenModel.__store.length, 0);
  assert.equal(email.calls.length, 0);
});

test('the public response (status/body) is byte-identical whether or not the email has orders', async () => {
  const email = fakeSendEmailSucceeds();

  const withOrders = await processOrdersAccessRequest({
    email: 'buyer@example.com',
    OrderModel: createFakeOrderModelWithOrders(true),
    OrderAccessTokenModel: createFakeOrderAccessTokenModel(),
    frontendBaseUrl: FRONTEND_BASE_URL,
    sendEmailFn: email.fn,
  });

  const withoutOrders = await processOrdersAccessRequest({
    email: 'nobody@example.com',
    OrderModel: createFakeOrderModelWithOrders(false),
    OrderAccessTokenModel: createFakeOrderAccessTokenModel(),
    frontendBaseUrl: FRONTEND_BASE_URL,
    sendEmailFn: email.fn,
  });

  assert.equal(withOrders.ok, withoutOrders.ok);
  assert.equal(withOrders.message, withoutOrders.message);
  // internalOutcome differs (that's the whole point) but is never sent to the client — server.js only forwards {ok, message}.
  assert.notEqual(withOrders.internalOutcome, withoutOrders.internalOutcome);
});

test('capitalization differences resolve to the same normalized email and the same generic outcome', async () => {
  const email = fakeSendEmailSucceeds();
  const OrderAccessTokenModel = createFakeOrderAccessTokenModel();

  const result = await processOrdersAccessRequest({
    email: 'Buyer@EXAMPLE.com',
    OrderModel: createFakeOrderModelWithOrders(true),
    OrderAccessTokenModel,
    frontendBaseUrl: FRONTEND_BASE_URL,
    sendEmailFn: email.fn,
  });

  assert.equal(result.internalOutcome, 'sent');
  assert.equal(OrderAccessTokenModel.__store[0].emailNormalized, 'buyer@example.com');
});

test('a malformed email returns a distinct, non-generic response (ordinary validation, not an enumeration leak)', async () => {
  const result = await processOrdersAccessRequest({
    email: 'not-an-email',
    OrderModel: createFakeOrderModelWithOrders(true),
    OrderAccessTokenModel: createFakeOrderAccessTokenModel(),
    frontendBaseUrl: FRONTEND_BASE_URL,
  });

  assert.equal(result.ok, false);
  assert.equal('internalOutcome' in result, true);
  assert.equal(result.internalOutcome, 'invalid-email');
});

test('a recent unexpired token for the same email prevents a second email from being sent (resend cooldown)', async () => {
  const now = new Date('2026-08-08T12:00:00Z');
  const OrderAccessTokenModel = createFakeOrderAccessTokenModel({
    existing: [
      {
        tokenHash: 'existing-hash',
        emailNormalized: 'buyer@example.com',
        createdAt: new Date('2026-08-08T11:59:00Z'), // 1 minute ago — inside the 2-minute cooldown
        expiresAt: new Date('2026-08-08T12:14:00Z'),
        usedAt: null,
      },
    ],
  });
  const email = fakeSendEmailSucceeds();

  const result = await processOrdersAccessRequest({
    email: 'buyer@example.com',
    OrderModel: createFakeOrderModelWithOrders(true),
    OrderAccessTokenModel,
    frontendBaseUrl: FRONTEND_BASE_URL,
    sendEmailFn: email.fn,
    now,
  });

  assert.equal(result.ok, GENERIC_RESPONSE.ok);
  assert.equal(result.internalOutcome, 'cooldown');
  assert.equal(OrderAccessTokenModel.__store.length, 1); // no new token created
  assert.equal(email.calls.length, 0); // no email sent again
});

test('a token older than the cooldown window (but still otherwise valid) does not block a new send', async () => {
  const now = new Date('2026-08-08T12:00:00Z');
  const OrderAccessTokenModel = createFakeOrderAccessTokenModel({
    existing: [
      {
        tokenHash: 'existing-hash',
        emailNormalized: 'buyer@example.com',
        createdAt: new Date('2026-08-08T11:50:00Z'), // 10 minutes ago — outside the 2-minute cooldown
        expiresAt: new Date('2026-08-08T12:05:00Z'),
        usedAt: null,
      },
    ],
  });
  const email = fakeSendEmailSucceeds();

  const result = await processOrdersAccessRequest({
    email: 'buyer@example.com',
    OrderModel: createFakeOrderModelWithOrders(true),
    OrderAccessTokenModel,
    frontendBaseUrl: FRONTEND_BASE_URL,
    sendEmailFn: email.fn,
    now,
  });

  assert.equal(result.internalOutcome, 'sent');
  assert.equal(OrderAccessTokenModel.__store.length, 2);
});

test('Resend failure still returns the generic success response — email failure is not an information leak', async () => {
  const OrderAccessTokenModel = createFakeOrderAccessTokenModel();
  const failingSendEmail = async () => ({ ok: false, error: 'Resend is down' });

  const result = await processOrdersAccessRequest({
    email: 'buyer@example.com',
    OrderModel: createFakeOrderModelWithOrders(true),
    OrderAccessTokenModel,
    frontendBaseUrl: FRONTEND_BASE_URL,
    sendEmailFn: failingSendEmail,
  });

  assert.equal(result.ok, GENERIC_RESPONSE.ok);
  assert.equal(result.message, GENERIC_RESPONSE.message);
  assert.equal(result.internalOutcome, 'email-failed'); // for internal logging only
});

test('the raw token is never stored in the database — only its hash', async () => {
  const OrderAccessTokenModel = createFakeOrderAccessTokenModel();
  const email = fakeSendEmailSucceeds();

  await processOrdersAccessRequest({
    email: 'buyer@example.com',
    OrderModel: createFakeOrderModelWithOrders(true),
    OrderAccessTokenModel,
    frontendBaseUrl: FRONTEND_BASE_URL,
    sendEmailFn: email.fn,
  });

  const stored = OrderAccessTokenModel.__store[0];
  // The magic link sent to the customer contains the raw token in its
  // fragment — assert the stored document's tokenHash never equals it,
  // and that the raw token appears nowhere in the stored document.
  const magicLinkUrl = email.calls[0].html;
  const rawTokenMatch = magicLinkUrl.match(/token=([0-9a-f]{64})/);
  assert.ok(rawTokenMatch, 'expected the email to contain a raw token in the link');
  const rawToken = rawTokenMatch[1];

  assert.notEqual(stored.tokenHash, rawToken);
  assert.ok(!JSON.stringify(stored).includes(rawToken));
});

test('the magic-link URL uses a URL fragment (#token=...), not a query parameter', async () => {
  const OrderAccessTokenModel = createFakeOrderAccessTokenModel();
  const email = fakeSendEmailSucceeds();

  await processOrdersAccessRequest({
    email: 'buyer@example.com',
    OrderModel: createFakeOrderModelWithOrders(true),
    OrderAccessTokenModel,
    frontendBaseUrl: FRONTEND_BASE_URL,
    sendEmailFn: email.fn,
  });

  assert.match(email.calls[0].html, /my-orders\/verify#token=[0-9a-f]{64}/);
  assert.ok(!email.calls[0].html.includes('?token='));
});
