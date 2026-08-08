'use strict';

// Exercises the actual composition pattern server.js's webhook handler
// uses — processCheckoutCompleted() to idempotently save the order, then
// (only if newly created) an unawaited sendEmail().catch() — using the
// real modules, not a re-implementation of the logic, so this can't drift
// from what the webhook actually does.

const test = require('node:test');
const assert = require('node:assert/strict');
const { processCheckoutCompleted } = require('../lib/process-checkout-completed');
const { sendEmail } = require('../lib/send-email');
const { createFakeOrderModel } = require('./helpers/fake-order-model');

const TEST_ENV = { RESEND_API_KEY: 're_test_placeholder', EMAIL_FROM: 'Test Sender <test@example.com>' };

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

/** Mirrors server.js's webhook body: save first, then (only for a new order) fire-and-forget email. */
async function simulateWebhookHandling({ session, stripeClient, catalog, OrderModel, emailClient }) {
  const result = await processCheckoutCompleted({ session, stripeClient, catalog, OrderModel });

  let emailAttempted = false;
  if (result.created) {
    emailAttempted = true;
    // Same shape as server.js: unawaited, errors swallowed via .catch().
    sendEmail(
      { to: result.order.email, subject: 'Order Confirmation', html: '<p>Thanks!</p>' },
      { client: emailClient, env: TEST_ENV },
    ).catch(() => {});
  }

  return { result, emailAttempted };
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
