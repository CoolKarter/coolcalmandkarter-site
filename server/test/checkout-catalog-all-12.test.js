'use strict';

// Phase 14B — proves the full secure-checkout resolution path (real
// getCatalog() + real validateCheckoutItems(), not a hand-rolled fake
// catalog) for EVERY one of the 12 books, not just the 2-3 spot-checked
// in checkout-catalog.test.js/validate-checkout-items.test.js. Uses only
// obviously-fake, safely-labeled test Price ID strings — never a real
// Stripe identifier, and no real Stripe network call ever occurs here.

const test = require('node:test');
const assert = require('node:assert/strict');
const { getCatalog, CATALOG_DEFINITIONS } = require('../lib/checkout-catalog');
const { validateCheckoutItems, MAX_QUANTITY_PER_ITEM } = require('../lib/validate-checkout-items');

function buildFakeEnv() {
  const env = {};
  for (const def of CATALOG_DEFINITIONS) {
    env[def.priceEnvVar] = `price_test_fake_${def.slug.replace(/-/g, '_')}`;
  }
  return env;
}

test('CATALOG_DEFINITIONS covers exactly the 12 known books', () => {
  assert.equal(CATALOG_DEFINITIONS.length, 12);
});

test('every one of the 12 books validates successfully through the real catalog + validator once its own env var is configured', () => {
  const env = buildFakeEnv();
  const catalog = getCatalog(env);

  for (const def of CATALOG_DEFINITIONS) {
    const result = validateCheckoutItems({ items: [{ slug: def.slug, quantity: 1 }] }, catalog);
    assert.equal(result.ok, true, `expected ${def.slug} to validate successfully`);
    assert.equal(result.items[0].slug, def.slug);
    assert.equal(result.items[0].stripePriceId, env[def.priceEnvVar]);
    assert.equal(result.items[0].title, def.title);
  }
});

test('each book resolves ONLY its own configured Price ID — never another book\'s (no cross-wiring)', () => {
  const env = buildFakeEnv();
  const catalog = getCatalog(env);

  for (const def of CATALOG_DEFINITIONS) {
    const entry = catalog.get(def.slug);
    for (const otherDef of CATALOG_DEFINITIONS) {
      if (otherDef.slug === def.slug) continue;
      assert.notEqual(entry.stripePriceId, env[otherDef.priceEnvVar], `${def.slug} must never resolve to ${otherDef.slug}'s Price ID`);
    }
  }
});

test('when none of the 12 env vars are configured, every book fails closed — not just some', () => {
  const catalog = getCatalog({});

  for (const def of CATALOG_DEFINITIONS) {
    assert.equal(catalog.get(def.slug).enabled, false, `expected ${def.slug} to be disabled with no env var set`);
    const result = validateCheckoutItems({ items: [{ slug: def.slug, quantity: 1 }] }, catalog);
    assert.equal(result.ok, false);
    assert.match(result.error, /not currently available/);
  }
});

test('a book missing ONLY its own env var fails closed even when every other book is fully configured — no fallback to another Price ID, no default', () => {
  const env = buildFakeEnv();
  delete env.STRIPE_PRICE_CHRISTMAS_AND_BABY;
  const catalog = getCatalog(env);

  const result = validateCheckoutItems({ items: [{ slug: 'christmas-and-baby', quantity: 1 }] }, catalog);
  assert.equal(result.ok, false);
  assert.match(result.error, /not currently available/);

  // Confirms this is truly isolated — every other book is completely unaffected.
  for (const def of CATALOG_DEFINITIONS) {
    if (def.slug === 'christmas-and-baby') continue;
    assert.equal(catalog.get(def.slug).enabled, true, `expected ${def.slug} to remain enabled`);
  }
});

test('the client can never supply its own price for any of the 12 books — the field is rejected outright, never silently dropped and honored', () => {
  const env = buildFakeEnv();
  const catalog = getCatalog(env);

  for (const def of CATALOG_DEFINITIONS) {
    const result = validateCheckoutItems({ items: [{ slug: def.slug, quantity: 1, price: 1 }] }, catalog);
    assert.equal(result.ok, false, `expected a client-supplied price on ${def.slug} to be rejected`);
    assert.match(result.error, /unsupported field/i);
  }
});

test('per-item quantity rules remain intact for every book, not just the previously-enabled ones', () => {
  const env = buildFakeEnv();
  const catalog = getCatalog(env);

  for (const def of CATALOG_DEFINITIONS) {
    const tooMany = validateCheckoutItems({ items: [{ slug: def.slug, quantity: MAX_QUANTITY_PER_ITEM + 1 }] }, catalog);
    assert.equal(tooMany.ok, false, `expected ${def.slug} to reject a quantity above the per-item cap`);

    const atCap = validateCheckoutItems({ items: [{ slug: def.slug, quantity: MAX_QUANTITY_PER_ITEM }] }, catalog);
    assert.equal(atCap.ok, true, `expected ${def.slug} to accept a quantity exactly at the per-item cap`);
  }
});

test('an unknown slug is rejected regardless of how many real books are configured', () => {
  const env = buildFakeEnv();
  const catalog = getCatalog(env);
  const result = validateCheckoutItems({ items: [{ slug: 'not-a-real-book', quantity: 1 }] }, catalog);
  assert.equal(result.ok, false);
  assert.match(result.error, /Unknown product/);
});

test('a mixed cart of several of the 12 books all resolves correctly in one request', () => {
  const env = buildFakeEnv();
  const catalog = getCatalog(env);
  const someSlugs = ['florida-beach-and-baby', 'abuelita-and-baby', 'thanksgiving-and-baby'];

  const result = validateCheckoutItems(
    { items: someSlugs.map((slug) => ({ slug, quantity: 2 })) },
    catalog,
  );
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 3);
  for (const slug of someSlugs) {
    const resolved = result.items.find((i) => i.slug === slug);
    assert.ok(resolved, `expected ${slug} in the resolved items`);
    assert.equal(resolved.stripePriceId, env[CATALOG_DEFINITIONS.find((d) => d.slug === slug).priceEnvVar]);
  }
});
