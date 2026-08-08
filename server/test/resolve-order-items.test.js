'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveOrderItems, parseMetadataItems } = require('../lib/resolve-order-items');

function buildTestCatalog() {
  const catalog = new Map();
  catalog.set('florida-beach-and-baby', {
    slug: 'florida-beach-and-baby',
    title: 'Florida, Beach & Baby',
    stripePriceId: 'price_test_florida',
    enabled: true,
  });
  catalog.set('go-to-sleep-karter', {
    slug: 'go-to-sleep-karter',
    title: 'Go To Sleep, Karter!',
    stripePriceId: 'price_test_karter',
    enabled: true,
  });
  return catalog;
}

test('resolves titles/quantities from a fake Stripe line-items response (no network call), with no pricing fields when the fake response has none', async () => {
  const catalog = buildTestCatalog();
  const session = { id: 'cs_test_123', metadata: {} };

  const fakeStripeClient = {
    checkout: {
      sessions: {
        listLineItems: async (sessionId) => {
          assert.equal(sessionId, 'cs_test_123');
          return {
            data: [
              { price: 'price_test_florida', quantity: 2 },
              { price: { id: 'price_test_karter' }, quantity: 1 },
            ],
          };
        },
      },
    },
  };

  const items = await resolveOrderItems({ session, stripeClient: fakeStripeClient, catalog });

  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    slug: 'florida-beach-and-baby',
    title: 'Florida, Beach & Baby',
    quantity: 2,
    unitPrice: null,
    lineTotal: null,
  });
  assert.deepEqual(items[1], {
    slug: 'go-to-sleep-karter',
    title: 'Go To Sleep, Karter!',
    quantity: 1,
    unitPrice: null,
    lineTotal: null,
  });
});

test('captures real unit price and line total when Stripe returns an expanded price with unit_amount', async () => {
  const catalog = buildTestCatalog();
  const session = { id: 'cs_test_pricing', metadata: {} };

  const fakeStripeClient = {
    checkout: {
      sessions: {
        listLineItems: async () => ({
          data: [
            {
              price: { id: 'price_test_florida', unit_amount: 999 },
              quantity: 3,
              amount_total: 2997,
            },
          ],
        }),
      },
    },
  };

  const items = await resolveOrderItems({ session, stripeClient: fakeStripeClient, catalog });

  assert.equal(items.length, 1);
  assert.equal(items[0].unitPrice, 999);
  assert.equal(items[0].lineTotal, 2997);
});

test('derives unit price from lineTotal/quantity when price.unit_amount is unavailable but amount_total is present', async () => {
  const catalog = buildTestCatalog();
  const session = { id: 'cs_test_derived_price', metadata: {} };

  const fakeStripeClient = {
    checkout: {
      sessions: {
        listLineItems: async () => ({
          data: [
            {
              // price is a bare string ID here, not an expanded object —
              // no unit_amount available directly.
              price: 'price_test_karter',
              quantity: 2,
              amount_total: 1998,
            },
          ],
        }),
      },
    },
  };

  const items = await resolveOrderItems({ session, stripeClient: fakeStripeClient, catalog });

  assert.equal(items[0].lineTotal, 1998);
  assert.equal(items[0].unitPrice, 999); // 1998 / 2, derived — never fabricated from our own catalog price
});

test('a line item whose Price ID is not in the catalog resolves to a safe "Unknown item" rather than throwing', async () => {
  const catalog = buildTestCatalog();
  const session = { id: 'cs_test_456', metadata: {} };

  const fakeStripeClient = {
    checkout: {
      sessions: {
        listLineItems: async () => ({
          data: [{ price: 'price_not_in_catalog', quantity: 3 }],
        }),
      },
    },
  };

  const items = await resolveOrderItems({ session, stripeClient: fakeStripeClient, catalog });
  assert.equal(items[0].title, 'Unknown item');
  assert.equal(items[0].slug, null);
  assert.equal(items[0].quantity, 3);
  assert.equal(items[0].unitPrice, null);
  assert.equal(items[0].lineTotal, null);
});

test('falls back to parsing metadata when the Stripe line-items call fails, with pricing fields null (never fabricated)', async () => {
  const catalog = buildTestCatalog();
  const session = {
    id: 'cs_test_789',
    metadata: { items: 'florida-beach-and-baby:2,go-to-sleep-karter:1' },
  };

  const fakeStripeClient = {
    checkout: {
      sessions: {
        listLineItems: async () => {
          throw new Error('simulated Stripe API failure');
        },
      },
    },
  };

  const items = await resolveOrderItems({ session, stripeClient: fakeStripeClient, catalog });

  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Florida, Beach & Baby');
  assert.equal(items[0].quantity, 2);
  assert.equal(items[0].unitPrice, null);
  assert.equal(items[0].lineTotal, null);
  assert.equal(items[1].title, 'Go To Sleep, Karter!');
  assert.equal(items[1].quantity, 1);
});

test('parseMetadataItems resolves titles from the catalog, not from the metadata string itself', () => {
  const catalog = buildTestCatalog();
  const items = parseMetadataItems('florida-beach-and-baby:3', catalog);
  assert.deepEqual(items, [
    { slug: 'florida-beach-and-baby', title: 'Florida, Beach & Baby', quantity: 3, unitPrice: null, lineTotal: null },
  ]);
});

test('parseMetadataItems handles an unknown slug and empty/missing input safely', () => {
  const catalog = buildTestCatalog();
  assert.deepEqual(parseMetadataItems('not-a-real-book:1', catalog), [
    { slug: null, title: 'Unknown item', quantity: 1, unitPrice: null, lineTotal: null },
  ]);
  assert.deepEqual(parseMetadataItems('', catalog), []);
  assert.deepEqual(parseMetadataItems(undefined, catalog), []);
});

test('falls back to the legacy JSON-array metadata format from the legacy route', async () => {
  const catalog = buildTestCatalog();
  const legacyMetadata = JSON.stringify([
    { price: 'price_test_florida', quantity: 2, title: 'Florida, Beach & Baby' },
    { price: 'price_test_karter', quantity: 1, title: 'Go To Sleep, Karter!' },
  ]);
  const session = { id: 'cs_test_legacy', metadata: { items: legacyMetadata } };

  const fakeStripeClient = {
    checkout: {
      sessions: {
        listLineItems: async () => {
          throw new Error('simulated Stripe API failure');
        },
      },
    },
  };

  const items = await resolveOrderItems({ session, stripeClient: fakeStripeClient, catalog });

  assert.equal(items.length, 2);
  // Legacy items never carry a slug — they predate the catalog.
  assert.equal(items[0].slug, null);
  assert.equal(items[0].title, 'Florida, Beach & Baby');
  assert.equal(items[0].quantity, 2);
  assert.equal(items[0].unitPrice, null);
  assert.equal(items[0].lineTotal, null);
  assert.equal(items[1].title, 'Go To Sleep, Karter!');
});

test('parseMetadataItems handles the legacy format directly, including a missing title falling back to "Unknown item"', () => {
  const catalog = buildTestCatalog();
  const legacyMetadata = JSON.stringify([{ price: 'price_test_florida', quantity: 4 }]);
  assert.deepEqual(parseMetadataItems(legacyMetadata, catalog), [
    { slug: null, title: 'Unknown item', quantity: 4, unitPrice: null, lineTotal: null },
  ]);
});

test('parseMetadataItems handles malformed legacy-looking JSON safely, without throwing', () => {
  const catalog = buildTestCatalog();
  assert.deepEqual(parseMetadataItems('[not valid json', catalog), []);
  assert.deepEqual(parseMetadataItems('[]', catalog), []);
  assert.deepEqual(parseMetadataItems('[null, "a string", 42]', catalog), []);
});

test('parseMetadataItems handles malformed compact-format garbage safely, without throwing', () => {
  const catalog = buildTestCatalog();
  assert.deepEqual(parseMetadataItems('totally:random:garbage,,,', catalog), [
    { slug: null, title: 'Unknown item', quantity: 1, unitPrice: null, lineTotal: null },
  ]);
});
