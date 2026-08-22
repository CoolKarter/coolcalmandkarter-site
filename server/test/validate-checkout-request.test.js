'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCheckoutRequest, MAX_EMAIL_LENGTH } = require('../lib/validate-checkout-request');

function buildTestCatalog() {
  const catalog = new Map();
  catalog.set('beach-and-baby', {
    slug: 'beach-and-baby',
    title: 'Beach & Baby',
    stripePriceId: 'price_test_florida',
    enabled: true,
  });
  return catalog;
}

test('accepts a request with a valid customerEmail', () => {
  const catalog = buildTestCatalog();
  const result = validateCheckoutRequest(
    { items: [{ slug: 'beach-and-baby', quantity: 1 }], customerEmail: 'reader@example.com' },
    catalog,
  );
  assert.equal(result.ok, true);
  assert.equal(result.customerEmail, 'reader@example.com');
});

test('accepts a request with customerEmail omitted entirely', () => {
  const catalog = buildTestCatalog();
  const result = validateCheckoutRequest({ items: [{ slug: 'beach-and-baby', quantity: 1 }] }, catalog);
  assert.equal(result.ok, true);
  assert.equal(result.customerEmail, undefined);
});

test('treats a blank customerEmail the same as omitted, not an error', () => {
  const catalog = buildTestCatalog();
  const result = validateCheckoutRequest(
    { items: [{ slug: 'beach-and-baby', quantity: 1 }], customerEmail: '   ' },
    catalog,
  );
  assert.equal(result.ok, true);
  assert.equal(result.customerEmail, undefined);
});

test('rejects a malformed customerEmail', () => {
  const catalog = buildTestCatalog();
  const result = validateCheckoutRequest(
    { items: [{ slug: 'beach-and-baby', quantity: 1 }], customerEmail: 'not-an-email' },
    catalog,
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /valid email/);
});

test('rejects an excessively long customerEmail', () => {
  const catalog = buildTestCatalog();
  const longLocalPart = 'a'.repeat(MAX_EMAIL_LENGTH);
  const result = validateCheckoutRequest(
    { items: [{ slug: 'beach-and-baby', quantity: 1 }], customerEmail: `${longLocalPart}@example.com` },
    catalog,
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /too long/);
});

test('rejects unsupported top-level request fields', () => {
  const catalog = buildTestCatalog();
  const result = validateCheckoutRequest(
    {
      items: [{ slug: 'beach-and-baby', quantity: 1 }],
      customerEmail: 'reader@example.com',
      stripePriceId: 'price_attacker_supplied',
    },
    catalog,
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /Unsupported request field/);
});

test('still enforces item-level validation via validateCheckoutItems', () => {
  const catalog = buildTestCatalog();
  const result = validateCheckoutRequest({ items: [{ slug: 'not-a-real-book', quantity: 1 }] }, catalog);
  assert.equal(result.ok, false);
  assert.match(result.error, /Unknown product/);
});
