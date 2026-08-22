'use strict';

// End-to-end proof (using the REAL catalog + REAL item validator together,
// not fakes) that a stale checkout request using an old, pre-rename slug
// resolves correctly once checkout is enabled — see
// lib/legacy-slug-aliases.js, lib/checkout-catalog.js, and
// lib/validate-checkout-items.js. No real Stripe call is made; only the
// env-var-driven Price ID resolution itself is exercised here (the exact
// same resolution server.js's real /api/checkout/session route uses).

const test = require('node:test');
const assert = require('node:assert/strict');
const { getCatalog } = require('../lib/checkout-catalog');
const { validateCheckoutItems } = require('../lib/validate-checkout-items');

const TEST_ENV = {
  STRIPE_PRICE_FLORIDA_BEACH_AND_BABY: 'price_test_florida_real',
  STRIPE_PRICE_BLACK_BEAUTIFUL_AND_BABY: 'price_test_black_beautiful_real',
};

test('the real catalog, keyed by the new canonical slug, resolves an old-slug checkout request to the correct current product and unchanged Stripe Price ID', () => {
  const catalog = getCatalog(TEST_ENV);

  const result = validateCheckoutItems(
    { items: [{ slug: 'florida-beach-and-baby', quantity: 2 }] },
    catalog,
  );

  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].slug, 'beach-and-baby');
  assert.equal(result.items[0].title, 'Beach & Baby');
  assert.equal(result.items[0].stripePriceId, 'price_test_florida_real');
  assert.equal(result.items[0].quantity, 2);
});

test('the real catalog resolves the old "black-beautiful-and-baby" slug to Black, Proud & Baby with its unchanged Stripe Price ID', () => {
  const catalog = getCatalog(TEST_ENV);

  const result = validateCheckoutItems(
    { items: [{ slug: 'black-beautiful-and-baby', quantity: 1 }] },
    catalog,
  );

  assert.equal(result.ok, true);
  assert.equal(result.items[0].slug, 'black-proud-and-baby');
  assert.equal(result.items[0].title, 'Black, Proud & Baby');
  assert.equal(result.items[0].stripePriceId, 'price_test_black_beautiful_real');
});

test('a mixed request using one old slug and one already-new slug for two different books resolves both correctly in one request', () => {
  const catalog = getCatalog(TEST_ENV);

  const result = validateCheckoutItems(
    {
      items: [
        { slug: 'florida-beach-and-baby', quantity: 1 },
        { slug: 'black-proud-and-baby', quantity: 1 },
      ],
    },
    catalog,
  );

  assert.equal(result.ok, true);
  assert.equal(result.items.length, 2);
  const slugs = result.items.map((i) => i.slug).sort();
  assert.deepEqual(slugs, ['beach-and-baby', 'black-proud-and-baby']);
});

test('if the renamed book\'s env var is unset, the old slug still resolves to the (disabled) current product — never silently treated as unknown', () => {
  const catalog = getCatalog({}); // no STRIPE_PRICE_* vars set at all
  const result = validateCheckoutItems(
    { items: [{ slug: 'florida-beach-and-baby', quantity: 1 }] },
    catalog,
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /not currently available/);
});

test('no client-controllable value ever influences which Stripe Price ID is used — only the env var name tied to the resolved canonical slug', () => {
  const catalog = getCatalog(TEST_ENV);
  const result = validateCheckoutItems(
    {
      items: [
        { slug: 'florida-beach-and-baby', quantity: 1, price: 'price_attacker_supplied' },
      ],
    },
    catalog,
  );
  // "price" is an unsupported field on the item shape — rejected outright,
  // exactly like the non-legacy-slug case (see validate-checkout-items.test.js).
  assert.equal(result.ok, false);
  assert.match(result.error, /unsupported fields/);
});
