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

test('resolves titles/quantities from a fake Stripe line-items response (no network call)', async () => {
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
  assert.deepEqual(items[0], { slug: 'florida-beach-and-baby', title: 'Florida, Beach & Baby', quantity: 2 });
  assert.deepEqual(items[1], { slug: 'go-to-sleep-karter', title: 'Go To Sleep, Karter!', quantity: 1 });
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
});

test('falls back to parsing metadata when the Stripe line-items call fails', async () => {
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
  assert.equal(items[1].title, 'Go To Sleep, Karter!');
  assert.equal(items[1].quantity, 1);
});

test('parseMetadataItems resolves titles from the catalog, not from the metadata string itself', () => {
  const catalog = buildTestCatalog();
  const items = parseMetadataItems('florida-beach-and-baby:3', catalog);
  assert.deepEqual(items, [{ slug: 'florida-beach-and-baby', title: 'Florida, Beach & Baby', quantity: 3 }]);
});

test('parseMetadataItems handles an unknown slug and empty/missing input safely', () => {
  const catalog = buildTestCatalog();
  assert.deepEqual(parseMetadataItems('not-a-real-book:1', catalog), [
    { slug: null, title: 'Unknown item', quantity: 1 },
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
  assert.equal(items[1].title, 'Go To Sleep, Karter!');
});

test('parseMetadataItems handles the legacy format directly, including a missing title falling back to "Unknown item"', () => {
  const catalog = buildTestCatalog();
  const legacyMetadata = JSON.stringify([{ price: 'price_test_florida', quantity: 4 }]);
  assert.deepEqual(parseMetadataItems(legacyMetadata, catalog), [
    { slug: null, title: 'Unknown item', quantity: 4 },
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
    { slug: null, title: 'Unknown item', quantity: 1 },
  ]);
});
