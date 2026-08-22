import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_SLUG_ALIASES, resolveLegacySlug, migrateCartSlugs } from '../src/lib/legacy-slug-aliases.js';

// Mirrors server/test/legacy-slug-aliases.test.js — the frontend and
// backend must apply the identical alias mapping. migrateCartSlugs() is
// the pure logic lib/cart.ts's readCart() delegates to (see that file);
// tested directly here since cart.ts itself can't be imported by plain
// `node --test` (it's TypeScript with a window/localStorage dependency —
// same class of constraint as every other browser-only module in this
// project, see store-status.test.js).

test('exactly the two renamed books have a legacy alias entry', () => {
  assert.equal(Object.keys(LEGACY_SLUG_ALIASES).length, 2);
});

test('resolveLegacySlug: the old "florida-beach-and-baby" resolves to "beach-and-baby"', () => {
  assert.equal(resolveLegacySlug('florida-beach-and-baby'), 'beach-and-baby');
});

test('resolveLegacySlug: the old "black-beautiful-and-baby" resolves to "black-proud-and-baby"', () => {
  assert.equal(resolveLegacySlug('black-beautiful-and-baby'), 'black-proud-and-baby');
});

test('resolveLegacySlug: an already-canonical slug and any unrelated slug pass through unchanged', () => {
  assert.equal(resolveLegacySlug('beach-and-baby'), 'beach-and-baby');
  assert.equal(resolveLegacySlug('thanksgiving-and-baby'), 'thanksgiving-and-baby');
});

// ---- migrateCartSlugs — the actual cart-reading migration logic ----

test('a cart with only old-slug entries migrates every one, preserving quantity', () => {
  const { cart, migrated } = migrateCartSlugs({
    'florida-beach-and-baby': 2,
    'black-beautiful-and-baby': 3,
  });
  assert.equal(migrated, true);
  assert.deepEqual(cart, { 'beach-and-baby': 2, 'black-proud-and-baby': 3 });
});

test('a cart with only current-slug entries is left alone — migrated is false, nothing rewritten', () => {
  const { cart, migrated } = migrateCartSlugs({ 'beach-and-baby': 4, 'mexican-and-baby': 1 });
  assert.equal(migrated, false);
  assert.deepEqual(cart, { 'beach-and-baby': 4, 'mexican-and-baby': 1 });
});

test('the customer\'s cart is never erased — an old-slug entry survives as its new-slug equivalent, never dropped', () => {
  const { cart } = migrateCartSlugs({ 'florida-beach-and-baby': 1 });
  assert.equal(Object.keys(cart).length, 1);
  assert.equal(cart['beach-and-baby'], 1);
});

test('an old-slug entry and a new-slug entry for the same product merge into ONE row, never a duplicate', () => {
  const { cart, migrated } = migrateCartSlugs({
    'florida-beach-and-baby': 2,
    'beach-and-baby': 3,
  });
  assert.equal(migrated, true);
  assert.deepEqual(cart, { 'beach-and-baby': 5 });
  assert.equal(Object.keys(cart).length, 1);
});

test('a merged old+new collision is capped at the same 20-per-item limit the backend enforces', () => {
  const { cart } = migrateCartSlugs({
    'black-beautiful-and-baby': 15,
    'black-proud-and-baby': 15,
  });
  assert.equal(cart['black-proud-and-baby'], 20);
});

test('unrelated books in the same cart are untouched by migration', () => {
  const { cart, migrated } = migrateCartSlugs({
    'florida-beach-and-baby': 1,
    'thanksgiving-and-baby': 2,
    'go-to-sleep-karter': 1,
  });
  assert.equal(migrated, true);
  assert.deepEqual(cart, {
    'beach-and-baby': 1,
    'thanksgiving-and-baby': 2,
    'go-to-sleep-karter': 1,
  });
});

test('invalid entries (non-string keys via numeric coercion, zero/negative/non-finite quantities) are dropped, matching the pre-existing readCart() sanitization', () => {
  const { cart } = migrateCartSlugs({
    'beach-and-baby': 0,
    'thanksgiving-and-baby': -1,
    'mexican-and-baby': Number.NaN,
    'go-to-sleep-karter': 2,
  });
  assert.deepEqual(cart, { 'go-to-sleep-karter': 2 });
});

test('an empty cart stays empty and is not flagged as migrated', () => {
  const { cart, migrated } = migrateCartSlugs({});
  assert.deepEqual(cart, {});
  assert.equal(migrated, false);
});
