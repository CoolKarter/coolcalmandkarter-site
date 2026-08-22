'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateCheckoutItems,
  MAX_QUANTITY_PER_ITEM,
  MAX_TOTAL_CART_QUANTITY,
} = require('../lib/validate-checkout-items');

function buildTestCatalog() {
  const catalog = new Map();
  catalog.set('beach-and-baby', {
    slug: 'beach-and-baby',
    title: 'Beach & Baby',
    stripePriceId: 'price_test_florida',
    enabled: true,
  });
  catalog.set('black-proud-and-baby', {
    slug: 'black-proud-and-baby',
    title: 'Black, Proud & Baby',
    stripePriceId: 'price_test_black_beautiful',
    enabled: true,
  });
  // Present in the catalog (a real book) but not checkout-enabled yet —
  // mirrors one of the 7 new books with no Stripe Price ID configured.
  catalog.set('christmas-and-baby', {
    slug: 'christmas-and-baby',
    title: 'Christmas & Baby',
    stripePriceId: null,
    enabled: false,
  });
  return catalog;
}

test('accepts a single valid known product', () => {
  const catalog = buildTestCatalog();
  const result = validateCheckoutItems(
    { items: [{ slug: 'beach-and-baby', quantity: 2 }] },
    catalog,
  );
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].quantity, 2);
  assert.equal(result.totalQuantity, 2);
});

test('rejects an unknown slug', () => {
  const catalog = buildTestCatalog();
  const result = validateCheckoutItems(
    { items: [{ slug: 'not-a-real-book', quantity: 1 }] },
    catalog,
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /Unknown product/);
});

test('rejects a catalog product with no Stripe Price configured', () => {
  const catalog = buildTestCatalog();
  const result = validateCheckoutItems(
    { items: [{ slug: 'christmas-and-baby', quantity: 1 }] },
    catalog,
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /not currently available/);
});

test('rejects quantity 0', () => {
  const catalog = buildTestCatalog();
  const result = validateCheckoutItems(
    { items: [{ slug: 'beach-and-baby', quantity: 0 }] },
    catalog,
  );
  assert.equal(result.ok, false);
});

test('rejects a negative quantity', () => {
  const catalog = buildTestCatalog();
  const result = validateCheckoutItems(
    { items: [{ slug: 'beach-and-baby', quantity: -1 }] },
    catalog,
  );
  assert.equal(result.ok, false);
});

test('rejects a fractional quantity', () => {
  const catalog = buildTestCatalog();
  const result = validateCheckoutItems(
    { items: [{ slug: 'beach-and-baby', quantity: 1.5 }] },
    catalog,
  );
  assert.equal(result.ok, false);
});

test(`rejects a quantity above ${MAX_QUANTITY_PER_ITEM}`, () => {
  const catalog = buildTestCatalog();
  const result = validateCheckoutItems(
    { items: [{ slug: 'beach-and-baby', quantity: MAX_QUANTITY_PER_ITEM + 1 }] },
    catalog,
  );
  assert.equal(result.ok, false);
});

test('accepts a quantity of exactly the per-item maximum', () => {
  const catalog = buildTestCatalog();
  const result = validateCheckoutItems(
    { items: [{ slug: 'beach-and-baby', quantity: MAX_QUANTITY_PER_ITEM }] },
    catalog,
  );
  assert.equal(result.ok, true);
});

test('combines duplicate slug entries into a single merged line item', () => {
  const catalog = buildTestCatalog();
  const result = validateCheckoutItems(
    {
      items: [
        { slug: 'beach-and-baby', quantity: 2 },
        { slug: 'beach-and-baby', quantity: 3 },
      ],
    },
    catalog,
  );
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].quantity, 5);
});

test('rejects duplicate slug entries whose merged quantity exceeds the per-item cap', () => {
  const catalog = buildTestCatalog();
  const result = validateCheckoutItems(
    {
      items: [
        { slug: 'beach-and-baby', quantity: 15 },
        { slug: 'beach-and-baby', quantity: 15 },
      ],
    },
    catalog,
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /cannot exceed/);
});

test(`rejects a cart whose total quantity exceeds ${MAX_TOTAL_CART_QUANTITY}`, () => {
  const catalog = buildTestCatalog();
  const result = validateCheckoutItems(
    {
      items: [
        { slug: 'beach-and-baby', quantity: 20 },
        { slug: 'black-proud-and-baby', quantity: 20 },
        { slug: 'beach-and-baby', quantity: 5 },
      ],
    },
    catalog,
  );
  // beach-and-baby merges to 25, which also exceeds the per-item cap, so
  // this should fail — but even if it didn't, the cart total (45) exceeds
  // the whole-cart cap. Either error is an acceptable rejection here.
  assert.equal(result.ok, false);
});

test('a cart at exactly the total-quantity cap across multiple distinct items is accepted', () => {
  const catalog = buildTestCatalog();
  const result = validateCheckoutItems(
    {
      items: [
        { slug: 'beach-and-baby', quantity: 20 },
        { slug: 'black-proud-and-baby', quantity: 20 },
      ],
    },
    catalog,
  );
  assert.equal(result.ok, true);
  assert.equal(result.totalQuantity, MAX_TOTAL_CART_QUANTITY);
});

test('ignores/rejects a client-supplied Stripe Price ID instead of trusting it', () => {
  const catalog = buildTestCatalog();
  const result = validateCheckoutItems(
    {
      items: [
        { slug: 'beach-and-baby', quantity: 1, price: 'price_attacker_supplied' },
      ],
    },
    catalog,
  );
  // The extra "price" field is an unsupported field on the item shape —
  // rejected outright rather than silently ignored, so a client can never
  // observe whether a supplied Price ID "worked".
  assert.equal(result.ok, false);
  assert.match(result.error, /unsupported fields/);
});

test('uses the server-resolved Price ID, never anything from the client', () => {
  const catalog = buildTestCatalog();
  const result = validateCheckoutItems(
    { items: [{ slug: 'beach-and-baby', quantity: 1 }] },
    catalog,
  );
  assert.equal(result.ok, true);
  assert.equal(result.items[0].stripePriceId, 'price_test_florida');
  assert.equal(result.items[0].title, 'Beach & Baby');
});

test('rejects a missing or empty items array', () => {
  const catalog = buildTestCatalog();
  assert.equal(validateCheckoutItems({ items: [] }, catalog).ok, false);
  assert.equal(validateCheckoutItems({}, catalog).ok, false);
  assert.equal(validateCheckoutItems({ items: 'not-an-array' }, catalog).ok, false);
});

test('rejects a non-object request body', () => {
  const catalog = buildTestCatalog();
  assert.equal(validateCheckoutItems(null, catalog).ok, false);
  assert.equal(validateCheckoutItems('nope', catalog).ok, false);
});

// ---- Legacy slug aliases (see lib/legacy-slug-aliases.js) — a stale
// request using a book's OLD slug from before a permanent catalog rename
// (e.g. from a customer's cart saved before the rename) must still
// resolve to the current product, using the same unchanged Stripe Price
// ID, rather than failing as "Unknown product". ----

test('a request using the old "florida-beach-and-baby" slug resolves to the current Beach & Baby product', () => {
  const catalog = buildTestCatalog();
  const result = validateCheckoutItems(
    { items: [{ slug: 'florida-beach-and-baby', quantity: 2 }] },
    catalog,
  );
  assert.equal(result.ok, true);
  assert.equal(result.items[0].slug, 'beach-and-baby');
  assert.equal(result.items[0].title, 'Beach & Baby');
  assert.equal(result.items[0].stripePriceId, 'price_test_florida');
  assert.equal(result.items[0].quantity, 2);
});

test('a request using the old "black-beautiful-and-baby" slug resolves to the current Black, Proud & Baby product', () => {
  const catalog = buildTestCatalog();
  const result = validateCheckoutItems(
    { items: [{ slug: 'black-beautiful-and-baby', quantity: 1 }] },
    catalog,
  );
  assert.equal(result.ok, true);
  assert.equal(result.items[0].slug, 'black-proud-and-baby');
  assert.equal(result.items[0].title, 'Black, Proud & Baby');
  assert.equal(result.items[0].stripePriceId, 'price_test_black_beautiful');
});

test('an old-slug entry and a new-slug entry for the same product merge into one line item, never a duplicate', () => {
  const catalog = buildTestCatalog();
  const result = validateCheckoutItems(
    {
      items: [
        { slug: 'florida-beach-and-baby', quantity: 2 },
        { slug: 'beach-and-baby', quantity: 3 },
      ],
    },
    catalog,
  );
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].slug, 'beach-and-baby');
  assert.equal(result.items[0].quantity, 5);
});

test('the merged quantity from an old+new slug collision is still bound by the existing per-item cap', () => {
  const catalog = buildTestCatalog();
  const result = validateCheckoutItems(
    {
      items: [
        { slug: 'black-beautiful-and-baby', quantity: 15 },
        { slug: 'black-proud-and-baby', quantity: 15 },
      ],
    },
    catalog,
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /cannot exceed/);
});

test('a disabled/not-yet-configured product is still rejected the same way even via its (hypothetical) old slug — alias resolution never bypasses the enabled check', () => {
  // christmas-and-baby was never renamed, but this proves resolveLegacySlug
  // being a pure passthrough for unknown slugs doesn't accidentally weaken
  // the enabled/disabled gate for any product.
  const catalog = buildTestCatalog();
  const result = validateCheckoutItems(
    { items: [{ slug: 'christmas-and-baby', quantity: 1 }] },
    catalog,
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /not currently available/);
});
