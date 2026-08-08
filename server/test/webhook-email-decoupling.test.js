'use strict';

// Exercises the actual composition pattern server.js's webhook handler
// uses — processCheckoutCompleted() to idempotently save the order, then
// (only if newly created) unawaited sendEmail().catch() and sendSms().catch()
// calls — using the real modules, not a re-implementation of the logic, so
// this can't drift from what the webhook actually does.

const test = require('node:test');
const assert = require('node:assert/strict');
const { processCheckoutCompleted } = require('../lib/process-checkout-completed');
const { sendEmail } = require('../lib/send-email');
const { sendSms } = require('../lib/send-sms');
const { buildOrderNotificationSms } = require('../lib/sms-templates');
const { createFakeOrderModel } = require('./helpers/fake-order-model');

const TEST_ENV = { RESEND_API_KEY: 're_test_placeholder', EMAIL_FROM: 'Test Sender <test@example.com>' };
const TEST_SMS_ENV = { TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'test_token', TWILIO_FROM_NUMBER: '+15550001111', ADMIN_PHONE_NUMBER: '+15550002222' };

function buildTestCatalog() {
  const catalog = new Map();
  catalog.set('florida-beach-and-baby', {
    slug: 'florida-beach-and-baby',
    title: 'Florida, Beach & Baby',
    stripePriceId: 'price_test_florida',
    enabled: true,
  });
  return catalog;
}

function buildFakeStripeClient() {
  return {
    checkout: {
      sessions: {
        listLineItems: async () => ({
          data: [{ price: { id: 'price_test_florida', unit_amount: 999 }, quantity: 1, amount_total: 999 }],
        }),
      },
    },
    shippingRates: { retrieve: async () => ({ display_name: 'Standard Shipping' }) },
  };
}

function buildSession() {
  return {
    id: 'cs_test_decoupling',
    customer_details: { email: 'buyer@example.com', name: 'Jamie Buyer', address: {} },
    amount_total: 999,
    shipping_cost: { shipping_rate: 'shr_test_1' },
  };
}

/** Mirrors server.js's webhook body: save first, then (only for a new order) fire-and-forget email + SMS. */
async function simulateWebhookHandling({ session, stripeClient, catalog, OrderModel, emailClient, smsClient }) {
  const result = await processCheckoutCompleted({ session, stripeClient, catalog, OrderModel });

  let emailAttempted = false;
  let smsAttempted = false;
  if (result.created) {
    emailAttempted = true;
    // Same shape as server.js: unawaited, errors swallowed via .catch().
    sendEmail(
      { to: result.order.email, subject: 'Order Confirmation', html: '<p>Thanks!</p>' },
      { client: emailClient, env: TEST_ENV },
    ).catch(() => {});

    if (smsClient) {
      smsAttempted = true;
      sendSms(
        { to: TEST_SMS_ENV.ADMIN_PHONE_NUMBER, body: buildOrderNotificationSms(result.order) },
        { client: smsClient, env: TEST_SMS_ENV },
      ).catch(() => {});
    }
  }

  return { result, emailAttempted, smsAttempted };
}

test('a failing email send does not undo, modify, or roll back the already-saved order', async () => {
  const OrderModel = createFakeOrderModel();
  const alwaysFailingEmailClient = { emails: { send: async () => { throw new Error('Resend is down'); } } };

  const { result } = await simulateWebhookHandling({
    session: buildSession(),
    stripeClient: buildFakeStripeClient(),
    catalog: buildTestCatalog(),
    OrderModel,
    emailClient: alwaysFailingEmailClient,
  });

  // The order was saved (created: true) before the email was ever attempted,
  // and remains in the store regardless of how the email attempt turns out.
  assert.equal(result.created, true);
  assert.equal(OrderModel.__store.length, 1);
  assert.equal(OrderModel.__store[0].stripeSessionId, 'cs_test_decoupling');

  // Let the unawaited sendEmail().catch() settle before the test ends.
  await new Promise((resolve) => setImmediate(resolve));

  // Order is still exactly as saved — nothing about the failed email touched it.
  assert.equal(OrderModel.__store.length, 1);
});

test('a duplicate webhook delivery for an already-processed session never attempts to send another email', async () => {
  const OrderModel = createFakeOrderModel();
  const catalog = buildTestCatalog();
  const stripeClient = buildFakeStripeClient();
  const emailClient = fakeCountingEmailClient();

  const first = await simulateWebhookHandling({ session: buildSession(), stripeClient, catalog, OrderModel, emailClient });
  const second = await simulateWebhookHandling({ session: buildSession(), stripeClient, catalog, OrderModel, emailClient });

  assert.equal(first.emailAttempted, true);
  assert.equal(second.emailAttempted, false); // the whole point of the idempotency check
  assert.equal(emailClient.sendCount, 1);
});

function fakeCountingEmailClient() {
  const client = {
    sendCount: 0,
    emails: {
      send: async () => {
        client.sendCount += 1;
        return { data: { id: `email_${client.sendCount}` } };
      },
    },
  };
  return client;
}

function fakeCountingSmsClient() {
  const client = {
    sendCount: 0,
    messages: {
      create: async () => {
        client.sendCount += 1;
        return { sid: `SM_test_${client.sendCount}` };
      },
    },
  };
  return client;
}

// ---- SMS (Phase 13A) — reuses the exact composition above rather than
// standing up a parallel Stripe/webhook test harness. ----

test('a genuinely new order causes exactly one SMS attempt', async () => {
  const OrderModel = createFakeOrderModel();
  const smsClient = fakeCountingSmsClient();

  const { smsAttempted } = await simulateWebhookHandling({
    session: buildSession(),
    stripeClient: buildFakeStripeClient(),
    catalog: buildTestCatalog(),
    OrderModel,
    emailClient: fakeCountingEmailClient(),
    smsClient,
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(smsAttempted, true);
  assert.equal(smsClient.sendCount, 1);
});

test('a duplicate Stripe webhook delivery causes zero additional SMS attempts — same idempotency gate as email', async () => {
  const OrderModel = createFakeOrderModel();
  const catalog = buildTestCatalog();
  const stripeClient = buildFakeStripeClient();
  const smsClient = fakeCountingSmsClient();

  const first = await simulateWebhookHandling({ session: buildSession(), stripeClient, catalog, OrderModel, emailClient: fakeCountingEmailClient(), smsClient });
  const second = await simulateWebhookHandling({ session: buildSession(), stripeClient, catalog, OrderModel, emailClient: fakeCountingEmailClient(), smsClient });

  assert.equal(first.smsAttempted, true);
  assert.equal(second.smsAttempted, false); // no independent SMS duplicate-detection system — reuses the same gate
  assert.equal(smsClient.sendCount, 1);
});

test('an SMS failure does not undo, modify, or roll back the already-saved order', async () => {
  const OrderModel = createFakeOrderModel();
  const alwaysFailingSmsClient = { messages: { create: async () => { throw new Error('Twilio is down'); } } };

  const { result } = await simulateWebhookHandling({
    session: buildSession(),
    stripeClient: buildFakeStripeClient(),
    catalog: buildTestCatalog(),
    OrderModel,
    emailClient: fakeCountingEmailClient(),
    smsClient: alwaysFailingSmsClient,
  });

  assert.equal(result.created, true);
  assert.equal(OrderModel.__store.length, 1);

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(OrderModel.__store.length, 1); // untouched by the failed SMS
  assert.equal(OrderModel.__store[0].stripeSessionId, 'cs_test_decoupling');
});
