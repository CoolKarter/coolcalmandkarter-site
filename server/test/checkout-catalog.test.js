'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CATALOG_DEFINITIONS, getCatalog, findByPriceId } = require('../lib/checkout-catalog');

test('catalog has exactly the 12 known book slugs', () => {
  const catalog = getCatalog({});
  assert.equal(catalog.size, 12);
  assert.ok(catalog.has('florida-beach-and-baby'));
  assert.ok(catalog.has('thanksgiving-and-baby'));
});

test('a book is disabled when its env var is unset', () => {
  const catalog = getCatalog({});
  const entry = catalog.get('florida-beach-and-baby');
  assert.equal(entry.enabled, false);
  assert.equal(entry.stripePriceId, null);
});

test('a book is disabled when its env var is an empty string', () => {
  const catalog = getCatalog({ STRIPE_PRICE_FLORIDA_BEACH_AND_BABY: '   ' });
  const entry = catalog.get('florida-beach-and-baby');
  assert.equal(entry.enabled, false);
});

test('a book is enabled and carries the configured Price ID when its env var is set', () => {
  const catalog = getCatalog({ STRIPE_PRICE_FLORIDA_BEACH_AND_BABY: 'price_test_florida' });
  const entry = catalog.get('florida-beach-and-baby');
  assert.equal(entry.enabled, true);
  assert.equal(entry.stripePriceId, 'price_test_florida');
});

test('every catalog definition maps to a unique slug and env var', () => {
  const slugs = new Set(CATALOG_DEFINITIONS.map((d) => d.slug));
  const envVars = new Set(CATALOG_DEFINITIONS.map((d) => d.priceEnvVar));
  assert.equal(slugs.size, CATALOG_DEFINITIONS.length);
  assert.equal(envVars.size, CATALOG_DEFINITIONS.length);
});

test('findByPriceId resolves the owning catalog entry', () => {
  const catalog = getCatalog({ STRIPE_PRICE_CHRISTMAS_AND_BABY: 'price_test_christmas' });
  const entry = findByPriceId(catalog, 'price_test_christmas');
  assert.equal(entry.slug, 'christmas-and-baby');
});

test('findByPriceId returns null for an unknown or missing Price ID', () => {
  const catalog = getCatalog({});
  assert.equal(findByPriceId(catalog, 'price_does_not_exist'), null);
  assert.equal(findByPriceId(catalog, null), null);
  assert.equal(findByPriceId(catalog, undefined), null);
});
