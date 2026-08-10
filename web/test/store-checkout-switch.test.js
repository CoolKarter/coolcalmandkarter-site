import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Urgent commerce change: a global PUBLIC_STORE_CHECKOUT_ENABLED switch
// disables all purchasing UI while the 12 physical books are out of
// stock, without touching any individual book's checkoutEnabled flag,
// pricing, or the Stripe catalog. Astro pages/components can't be
// imported by plain `node --test` (see cart-checkout.test.js and
// product-page-mobile.test.js for the same constraint and established
// workaround), so these tests read the real source directly. The pure
// parsing rule itself is tested in store-status.test.js; this file
// covers how each page actually wires that flag in.

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.dirname(here);

const productSource = readFileSync(path.join(webRoot, 'src/pages/books/[slug].astro'), 'utf8');
const shopSource = readFileSync(path.join(webRoot, 'src/pages/shop.astro'), 'utf8');
const bookCardSource = readFileSync(path.join(webRoot, 'src/components/BookCard.astro'), 'utf8');
const cartSource = readFileSync(path.join(webRoot, 'src/pages/cart.astro'), 'utf8');

// ---- Product page ----

test('product page: purchase controls require BOTH checkoutEnabled AND the global store switch', () => {
  assert.match(productSource, /const STORE_CHECKOUT_ENABLED = isStoreCheckoutEnabled\(import\.meta\.env\.PUBLIC_STORE_CHECKOUT_ENABLED\);/);
  assert.match(productSource, /const canAddToCart = data\.checkoutEnabled && STORE_CHECKOUT_ENABLED;/);
});

test('product page: the disabled state shows "Out of Stock" / "More copies coming soon." — never the old "checkout setup in progress" copy', () => {
  assert.match(productSource, /<p class="out-of-stock-label">Out of Stock<\/p>/);
  assert.match(productSource, /<p class="out-of-stock-copy">More copies coming soon\.<\/p>/);
  assert.doesNotMatch(productSource, /checkout setup in progress/i);
});

test('product page: no clickable Add to Cart button renders in the disabled branch — it is a completely separate element', () => {
  const disabledBranch = productSource.match(/<div class="out-of-stock" role="status">[\s\S]*?<\/div>/)[0];
  assert.doesNotMatch(disabledBranch, /add-to-cart-button/);
  assert.doesNotMatch(disabledBranch, /<button/);
});

test('product page: price and age badge are rendered outside the canAddToCart branch — always visible regardless of stock state', () => {
  assert.match(productSource, /\{priceDisplay && <span class="fact-price">\{priceDisplay\}<\/span>\}/);
  assert.match(productSource, /\{data\.ageRange && <span class="fact-age">Ages \{data\.ageRange\}<\/span>\}/);
});

// ---- Shop / BookCard ----

test('shop page: computes the store switch once and passes it down to every BookCard', () => {
  assert.match(shopSource, /const STORE_CHECKOUT_ENABLED = isStoreCheckoutEnabled\(import\.meta\.env\.PUBLIC_STORE_CHECKOUT_ENABLED\);/);
  assert.match(shopSource, /storeCheckoutEnabled=\{STORE_CHECKOUT_ENABLED\}/);
});

test('BookCard: shows an "Out of Stock" badge for an otherwise-available book only when the store switch is off, reusing the existing badge slot', () => {
  assert.match(bookCardSource, /\{isAvailable && !storeCheckoutEnabled && <span class="book-availability">Out of Stock<\/span>\}/);
  // "Coming Soon" (a genuinely unavailable book) is untouched and independent of the store switch.
  assert.match(bookCardSource, /\{!isAvailable && <span class="book-availability">Coming Soon<\/span>\}/);
});

test('BookCard: storeCheckoutEnabled defaults to true, so any caller that forgets to pass it never falsely shows Out of Stock', () => {
  assert.match(bookCardSource, /storeCheckoutEnabled\?: boolean;/);
  assert.match(bookCardSource, /storeCheckoutEnabled = true/);
});

test('shop page: prices remain rendered regardless of the store switch — untouched by this change', () => {
  assert.doesNotMatch(shopSource, /STORE_CHECKOUT_ENABLED[\s\S]{0,80}priceDisplay/);
});

// ---- Cart ----

test('cart: the store switch is baked in as a data attribute on #cart-summary at build time', () => {
  assert.match(cartSource, /data-store-checkout-enabled=\{STORE_CHECKOUT_ENABLED \? 'true' : 'false'\}/);
});

test('cart: when disabled, both Checkout buttons are disabled and relabeled "Out of Stock" — never left clickable', () => {
  const guardBlock = cartSource.match(/if \(!storeCheckoutEnabled\) \{[\s\S]*?\n {2}\}/)[0];
  assert.match(guardBlock, /checkoutButton\.disabled = true;/);
  assert.match(guardBlock, /checkoutButton\.textContent = 'Out of Stock';/);
  assert.match(guardBlock, /stickyCheckoutButton\.disabled = true;/);
  assert.match(guardBlock, /stickyCheckoutButton\.textContent = 'Out of Stock';/);
});

test('cart: the disabled-state copy says "More copies coming soon." and never exposes technical/env terminology', () => {
  assert.match(cartSource, /Out of Stock\. More copies coming soon\./);
  assert.doesNotMatch(cartSource, /STORE_CHECKOUT_ENABLED[\s\S]{0,40}textContent/);
});

test('cart: performCheckout() returns early when the store switch is off — no network request is even attempted', () => {
  const fnBody = cartSource.match(/async function performCheckout\(\): Promise<void> \{([\s\S]*?)\n {2}\}/)[0];
  const guardIndex = fnBody.indexOf('if (!storeCheckoutEnabled) return;');
  const fetchIndex = fnBody.indexOf('createCheckoutSession(items)');
  assert.ok(guardIndex > -1, 'expected an early-return guard');
  assert.ok(guardIndex < fetchIndex, 'expected the guard to run before createCheckoutSession is ever called');
});

test('cart: setCheckoutBusy() never re-enables the button when the store switch is off, even after a checkout attempt settles', () => {
  const fnBody = cartSource.match(/function setCheckoutBusy\(busy: boolean\): void \{([\s\S]*?)\n {2}\}/)[0];
  assert.match(fnBody, /!storeCheckoutEnabled/);
});

test('cart: the cart itself is never cleared or read differently because of the store switch — readCart()/localStorage logic is untouched', () => {
  assert.doesNotMatch(cartSource, /storeCheckoutEnabled[\s\S]{0,120}(removeItem|clearCart|CART_STORAGE_KEY)/);
});

// ---- Cross-cutting ----

test('none of the modified files reference a Stripe Price ID — the global switch is purely a UI/availability gate', () => {
  for (const source of [productSource, shopSource, bookCardSource, cartSource]) {
    assert.doesNotMatch(source, /stripePriceId/i);
  }
});
