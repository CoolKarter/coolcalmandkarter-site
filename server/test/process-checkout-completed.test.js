'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { processCheckoutCompleted } = require('../lib/process-checkout-completed');
const { createFakeOrderModel } = require('./helpers/fake-order-model');

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

function buildFakeStripeClient({ lineItems, shippingRateName = 'Standard Shipping (5–8 Business Days)' } = {}) {
  return {
    checkout: {
      sessions: {
        listLineItems: async () => ({
          data: lineItems || [
            { price: { id: 'price_test_florida', unit_amount: 999 }, quantity: 2, amount_total: 1998 },
          ],
        }),
      },
    },
    shippingRates: {
      retrieve: async () => ({ display_name: shippingRateName }),
    },
  };
}

function buildSession(overrides = {}) {
  return {
    id: 'cs_test_session_1',
    customer_details: { email: 'buyer@example.com', name: 'Jamie Buyer', address: { line1: '1 Main St', city: 'Tampa', state: 'FL', postal_code: '33602', country: 'US' } },
    amount_total: 1998,
    shipping_cost: { shipping_rate: 'shr_test_1' },
    ...overrides,
  };
}

test('creates a new order with a generated order number and real item pricing on first processing', async () => {
  const OrderModel = createFakeOrderModel();
  const result = await processCheckoutCompleted({
    session: buildSession(),
    stripeClient: buildFakeStripeClient(),
    catalog: buildTestCatalog(),
    OrderModel,
  });

  assert.equal(result.created, true);
  assert.equal(result.order.stripeSessionId, 'cs_test_session_1');
  assert.match(result.order.orderNumber, /^CCK-\d{8}-[0-9A-F]{4}$/);
  assert.equal(result.order.email, 'buyer@example.com');
  assert.equal(result.order.items[0].unitPrice, 999);
  assert.equal(result.order.items[0].lineTotal, 1998);
  assert.equal(result.order.orderStatus, 'received'); // Phase 13B: every new order starts here
  assert.equal(result.order.emailNormalized, 'buyer@example.com'); // Phase 13C: trimmed/lowercased for My Orders lookup
  assert.equal(OrderModel.__store.length, 1);
});

test('emailNormalized is omitted (never blocks the order save) when the Stripe-supplied email is malformed', async () => {
  const OrderModel = createFakeOrderModel();
  const result = await processCheckoutCompleted({
    session: buildSession({ customer_details: { email: 'no-email', name: 'Jamie Buyer', address: {} } }),
    stripeClient: buildFakeStripeClient(),
    catalog: buildTestCatalog(),
    OrderModel,
  });

  assert.equal(result.created, true); // the order still saves successfully
  assert.equal('emailNormalized' in result.order, false);
});

test('a second call for the same Stripe session (webhook retry) does not create a duplicate order or a second order number', async () => {
  const OrderModel = createFakeOrderModel();
  const catalog = buildTestCatalog();
  const stripeClient = buildFakeStripeClient();

  const first = await processCheckoutCompleted({ session: buildSession(), stripeClient, catalog, OrderModel });
  const second = await processCheckoutCompleted({ session: buildSession(), stripeClient, catalog, OrderModel });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.order.orderNumber, first.order.orderNumber);
  assert.equal(OrderModel.__store.length, 1); // still only one order in the "database"
});

test('a concurrent duplicate delivery (findOne races ahead of save) is treated as already-processed, not a failure', async () => {
  const OrderModel = createFakeOrderModel();
  const catalog = buildTestCatalog();
  const stripeClient = buildFakeStripeClient();
  const session = buildSession();

  // Simulate: both calls' findOne() return null (neither sees the other's
  // write yet), then the first call's save() commits before the second
  // call's save() runs — reproduced here by having the *second* call's
  // save() insert a competing order for the same session just before it
  // tries to commit its own.
  OrderModel.__setOnBeforeSave(async () => {
    const racer = new OrderModel({ stripeSessionId: session.id, orderNumber: 'CCK-20260101-0000' });
    await racer.save();
  });

  const result = await processCheckoutCompleted({ session, stripeClient, catalog, OrderModel });

  assert.equal(result.created, false);
  assert.equal(result.order.orderNumber, 'CCK-20260101-0000'); // the racer's order, not a second one
  assert.equal(OrderModel.__store.length, 1);
});

test('retries with a new order number if the generated one collides (extremely rare, but protected)', async () => {
  const OrderModel = createFakeOrderModel({
    existing: [{ stripeSessionId: 'cs_other_session', orderNumber: 'CCK-20260808-AAAA' }],
  });
  const catalog = buildTestCatalog();
  const stripeClient = buildFakeStripeClient();

  let calls = 0;
  const generateOrderNumber = () => {
    calls += 1;
    return calls === 1 ? 'CCK-20260808-AAAA' : 'CCK-20260808-BBBB'; // first collides with the seeded order, second doesn't
  };

  const result = await processCheckoutCompleted({
    session: buildSession(),
    stripeClient,
    catalog,
    OrderModel,
    generateOrderNumber,
  });

  assert.equal(result.created, true);
  assert.equal(result.order.orderNumber, 'CCK-20260808-BBBB');
  assert.equal(calls, 2);
});

test('propagates a genuine (non-duplicate) save failure instead of swallowing it', async () => {
  const OrderModel = createFakeOrderModel();
  const originalSave = OrderModel.prototype.save;
  OrderModel.prototype.save = async function throwsGenericError() {
    throw new Error('MongoDB unreachable');
  };

  await assert.rejects(
    () => processCheckoutCompleted({
      session: buildSession(),
      stripeClient: buildFakeStripeClient(),
      catalog: buildTestCatalog(),
      OrderModel,
    }),
    /MongoDB unreachable/,
  );

  OrderModel.prototype.save = originalSave;
});
