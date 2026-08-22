'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOrderNotificationSms } = require('../lib/sms-templates');

function buildTestOrder(overrides = {}) {
  return {
    orderNumber: 'CCK-20260808-9164',
    name: 'Jane Doe',
    email: 'jane@example.com',
    amount: 1998,
    items: [
      { title: 'Beach & Baby', quantity: 1, unitPrice: 999, lineTotal: 999, slug: 'florida-beach-and-baby' },
      { title: 'Black, Proud & Baby', quantity: 1, unitPrice: 999, lineTotal: 999, slug: 'black-beautiful-and-baby' },
    ],
    address: { line1: '123 Main St', city: 'Tampa', state: 'FL', postal_code: '33602', country: 'US' },
    shippingMethod: 'Standard Shipping',
    ...overrides,
  };
}

test('builds an SMS using the real order number, item count, total, and customer name', () => {
  const body = buildOrderNotificationSms(buildTestOrder());

  assert.match(body, /CCK-20260808-9164/);
  assert.match(body, /2 books/);
  assert.match(body, /\$19\.98/);
  assert.match(body, /Jane Doe/);
  assert.match(body, /New CCK Order/);
});

test('never includes shipping address, Stripe Session ID, Mongo ObjectId, tracking info, or credentials', () => {
  const order = buildTestOrder({ _id: '674f2a1b9c3d4e5f6a7b8c9d' });
  const body = buildOrderNotificationSms(order);
  const lower = body.toLowerCase();

  assert.ok(!body.includes('123 Main St'));
  assert.ok(!body.includes('Tampa'));
  assert.ok(!body.includes('33602'));
  assert.ok(!body.includes('cs_'));
  assert.ok(!body.includes('674f2a1b9c3d4e5f6a7b8c9d'));
  assert.ok(!lower.includes('tracking'));
  assert.ok(!lower.includes('carrier'));
  assert.ok(!lower.includes('sk_'));
  assert.ok(!lower.includes('token'));
});

test('stays within GSM-7 single-segment length (160 chars) for a typical order — no emoji/smart punctuation forcing UCS-2', () => {
  const body = buildOrderNotificationSms(buildTestOrder());

  // eslint-disable-next-line no-control-regex
  assert.match(body, /^[\x00-\x7F]*$/, 'body should be plain ASCII, not force UCS-2 encoding');
  assert.ok(body.length <= 160, `expected <=160 chars for a typical order, got ${body.length}`);
});

test('singularizes "book" for a single-item order', () => {
  const order = buildTestOrder({ items: [{ title: 'Solo Book', quantity: 1, unitPrice: 999, lineTotal: 999, slug: 'solo' }], amount: 999 });
  const body = buildOrderNotificationSms(order);
  assert.match(body, /1 book -/);
  assert.ok(!body.includes('1 books'));
});

test('sums quantities across multiple distinct line items, not just item count', () => {
  const order = buildTestOrder({
    items: [
      { title: 'A', quantity: 3, unitPrice: 999, lineTotal: 2997, slug: 'a' },
      { title: 'B', quantity: 2, unitPrice: 999, lineTotal: 1998, slug: 'b' },
    ],
    amount: 4995,
  });
  const body = buildOrderNotificationSms(order);
  assert.match(body, /5 books/);
});

test('gracefully handles a missing customer name rather than throwing or printing "undefined"', () => {
  const order = buildTestOrder({ name: undefined });
  assert.doesNotThrow(() => buildOrderNotificationSms(order));
  const body = buildOrderNotificationSms(order);
  assert.ok(!body.includes('undefined'));
});

test('gracefully handles a missing/empty items array rather than throwing', () => {
  const order = buildTestOrder({ items: undefined, amount: 0 });
  assert.doesNotThrow(() => buildOrderNotificationSms(order));
});
