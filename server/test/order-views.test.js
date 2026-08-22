'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { toCustomerOrderView, toAdminOrderView } = require('../lib/order-views');

function buildFullOrder(overrides = {}) {
  return {
    _id: '674f2a1b9c3d4e5f6a7b8c9d',
    __v: 0,
    name: 'Jane Doe',
    email: 'jane@example.com',
    bookTitle: 'Beach & Baby x1',
    shippingMethod: 'Standard Shipping (5–8 Business Days)',
    items: [
      { slug: 'florida-beach-and-baby', title: 'Beach & Baby', quantity: 1, unitPrice: 999, lineTotal: 999 },
    ],
    amount: 999,
    address: { line1: '1 Main St', line2: '', city: 'Tampa', state: 'FL', postal_code: '33602', country: 'US' },
    date: new Date('2026-08-08T12:00:00Z'),
    stripeSessionId: 'cs_test_abc123',
    orderNumber: 'CCK-20260808-4F2A',
    orderStatus: 'shipped',
    carrier: 'USPS',
    trackingNumber: '9400111899223197428490',
    shippedAt: new Date('2026-08-09T10:00:00Z'),
    deliveredAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

// ---- Customer view: exposure boundary ----

test('customer view never includes Mongo _id or __v', () => {
  const view = toCustomerOrderView(buildFullOrder());
  assert.equal('_id' in view, false);
  assert.equal('__v' in view, false);
});

test('customer view never includes stripeSessionId', () => {
  const view = toCustomerOrderView(buildFullOrder());
  assert.equal('stripeSessionId' in view, false);
  assert.ok(!JSON.stringify(view).includes('cs_test_abc123'));
});

test('customer view never includes customer name/email (identity comes from the session, not the order payload)', () => {
  const view = toCustomerOrderView(buildFullOrder());
  assert.equal('name' in view, false);
  assert.equal('email' in view, false);
});

test('customer view includes legitimate tracking info when it genuinely exists', () => {
  const view = toCustomerOrderView(buildFullOrder());
  assert.equal(view.carrier, 'USPS');
  assert.equal(view.trackingNumber, '9400111899223197428490');
  assert.deepEqual(view.shippedAt, new Date('2026-08-09T10:00:00Z'));
});

test('customer view never invents tracking info — absent fields stay null, not fabricated', () => {
  const view = toCustomerOrderView(buildFullOrder({ carrier: undefined, trackingNumber: undefined, shippedAt: undefined }));
  assert.equal(view.carrier, null);
  assert.equal(view.trackingNumber, null);
  assert.equal(view.shippedAt, null);
});

test('customer view exposes the normalized order status', () => {
  const view = toCustomerOrderView(buildFullOrder({ orderStatus: 'processing' }));
  assert.equal(view.orderStatus, 'processing');
});

test('customer view exposes items/pricing/shipping/total as documented', () => {
  const view = toCustomerOrderView(buildFullOrder());
  assert.equal(view.orderNumber, 'CCK-20260808-4F2A');
  assert.equal(view.items[0].title, 'Beach & Baby');
  assert.equal(view.items[0].unitPrice, 999);
  assert.equal(view.items[0].lineTotal, 999);
  assert.equal(view.amount, 999);
  assert.equal(view.shippingMethod, 'Standard Shipping (5–8 Business Days)');
  assert.equal(view.address.city, 'Tampa');
});

// ---- Admin view ----

test('admin view includes Stripe Session ID for troubleshooting', () => {
  const view = toAdminOrderView(buildFullOrder());
  assert.equal(view.stripeSessionId, 'cs_test_abc123');
});

test('admin view includes customer name/email', () => {
  const view = toAdminOrderView(buildFullOrder());
  assert.equal(view.name, 'Jane Doe');
  assert.equal(view.email, 'jane@example.com');
});

test('admin view still never includes Mongo _id/__v or any server secret', () => {
  const view = toAdminOrderView(buildFullOrder());
  assert.equal('_id' in view, false);
  assert.equal('__v' in view, false);
  const serialized = JSON.stringify(view).toLowerCase();
  assert.ok(!serialized.includes('stripe_secret_key'));
  assert.ok(!serialized.includes('mongo_uri'));
  assert.ok(!serialized.includes('resend_api_key'));
  assert.ok(!serialized.includes('twilio_auth_token'));
});

test('admin view includes everything the customer view has, plus admin-only fields', () => {
  const order = buildFullOrder();
  const customerView = toCustomerOrderView(order);
  const adminView = toAdminOrderView(order);

  for (const key of Object.keys(customerView)) {
    assert.deepEqual(adminView[key], customerView[key], `expected admin view to include customer field "${key}"`);
  }
});

// ---- Legacy order compatibility (critical requirement) ----

test('toCustomerOrderView never crashes on a bare-minimum legacy order missing every optional field', () => {
  const legacyOrder = {
    name: 'Old Customer',
    email: 'old@example.com',
    bookTitle: 'Some Book x1',
    amount: 999,
    address: { line1: '1 Old St', city: 'Tampa', state: 'FL', postal_code: '33602', country: 'US' },
    date: new Date('2025-01-01T00:00:00Z'),
    // no items[], no orderNumber, no stripeSessionId, no orderStatus,
    // no carrier/trackingNumber/shippedAt/deliveredAt
  };

  assert.doesNotThrow(() => toCustomerOrderView(legacyOrder));
  const view = toCustomerOrderView(legacyOrder);

  assert.equal(view.orderNumber, null);
  assert.equal(view.orderStatus, 'received'); // normalized, never left undefined
  assert.deepEqual(view.items, []);
  assert.equal(view.carrier, null);
  assert.equal(view.trackingNumber, null);
});

test('toAdminOrderView never crashes on the same bare-minimum legacy order', () => {
  const legacyOrder = { name: 'Old Customer', email: 'old@example.com', amount: 999, address: {}, date: new Date() };
  assert.doesNotThrow(() => toAdminOrderView(legacyOrder));
  const view = toAdminOrderView(legacyOrder);
  assert.equal(view.stripeSessionId, null);
  assert.equal(view.orderStatus, 'received');
});

test('legacy order items missing slug/pricing map to null rather than throwing or guessing a value', () => {
  const legacyOrder = buildFullOrder({ items: [{ title: 'Legacy Book', quantity: 2 }] });
  const view = toCustomerOrderView(legacyOrder);
  assert.equal(view.items[0].slug, null);
  assert.equal(view.items[0].unitPrice, null);
  assert.equal(view.items[0].lineTotal, null);
  assert.equal(view.items[0].quantity, 2);
});

test('completely empty input does not throw for either view function', () => {
  assert.doesNotThrow(() => toCustomerOrderView({}));
  assert.doesNotThrow(() => toAdminOrderView({}));
  assert.doesNotThrow(() => toCustomerOrderView(undefined));
  assert.doesNotThrow(() => toAdminOrderView(undefined));
});
