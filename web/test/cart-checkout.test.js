import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Phase 14C — cart.astro's own inline <script> (Astro pages can't be
// imported by plain `node --test`, same constraint every other
// page-embedded-logic test in this project works around — see
// book-catalog.test.js) is where the checkout payload, order-summary
// markup, and pricing math actually live. These tests read the real
// source directly and assert on the specific lines the Phase 14C
// two-column/sticky-summary redesign was required to leave untouched, so
// a future edit to the layout can't silently change checkout security or
// pricing behavior without failing a test.

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.dirname(here);
const cartSource = readFileSync(path.join(webRoot, 'src/pages/cart.astro'), 'utf8');
const booksDir = path.join(webRoot, 'src/content/books');

test('the checkout payload sent to createCheckoutSession only ever includes slug and quantity', () => {
  assert.match(
    cartSource,
    /\.map\(\(\[slug, quantity\]\)\s*=>\s*\(\{\s*slug,\s*quantity\s*\}\)\)/,
    'expected the items builder to map to exactly { slug, quantity }',
  );
});

test('cart.astro never references a Stripe Price ID anywhere in its source', () => {
  assert.doesNotMatch(cartSource, /stripePriceId/i);
});

test('the server-rendered catalog embedded for the client script exposes only display fields, never a price ID', () => {
  const catalogEntryMatch = cartSource.match(/return\s*\{([\s\S]*?)\};\s*\n\s*\}\),?\s*\n\s*\);/);
  assert.ok(catalogEntryMatch, 'expected to find the catalog entry object literal');
  const fields = catalogEntryMatch[1];
  for (const expected of ['slug', 'title', 'price', 'imageSrc', 'imageAlt']) {
    assert.match(fields, new RegExp(expected), `expected catalog entry to include ${expected}`);
  }
  assert.doesNotMatch(fields, /stripePriceId/i);
});

test('only checkoutEnabled books are ever included in the cart catalog', () => {
  assert.match(cartSource, /getCollection\('books'\)\)\.filter\(\(book\)\s*=>\s*book\.data\.checkoutEnabled\)/);
});

test('every one of the 12 book content files is checkout-enabled, so the cart catalog resolves all 12', () => {
  const bookFiles = readdirSync(booksDir).filter((f) => f.endsWith('.md'));
  assert.equal(bookFiles.length, 12);
  for (const file of bookFiles) {
    const content = readFileSync(path.join(booksDir, file), 'utf8');
    const disabled = /^checkoutEnabled:\s*false\s*$/m.test(content);
    assert.equal(disabled, false, `expected ${file} to be checkout-enabled`);
  }
});

test('per-item subtotal and cart total math is unchanged: price * quantity, summed', () => {
  assert.match(cartSource, /const subtotal = product\.price \* quantity;/);
  assert.match(cartSource, /total \+= subtotal;/);
});

test('order summary markup (total, checkout button, status region) is present', () => {
  assert.match(cartSource, /id="order-summary"/);
  assert.match(cartSource, /id="cart-total"/);
  assert.match(cartSource, /id="checkout-button"[^>]*>Checkout</);
  assert.match(cartSource, /id="checkout-status"/);
});

test('the checkout button is not disabled or hidden by default in the markup — only the wrapping summary section starts hidden, pending cart contents', () => {
  const summaryTag = cartSource.match(/<div\s+id="cart-summary"[\s\S]*?>/)[0];
  assert.match(summaryTag, /\bhidden\b/);

  const buttonTag = cartSource.match(/<button type="button" id="checkout-button"[^>]*>/)[0];
  assert.doesNotMatch(buttonTag, /disabled/);
  assert.doesNotMatch(buttonTag, /hidden/);
});

test('the checkout button is wired to the real createCheckoutSession handler, not a stub', () => {
  assert.match(cartSource, /import\s*\{\s*createCheckoutSession\s*\}\s*from\s*'\.\.\/lib\/api'/);
  assert.match(cartSource, /checkoutButton\?\.addEventListener\('click', performCheckout\)/);
  assert.match(cartSource, /const url = await createCheckoutSession\(items\);/);
});

test('the desktop two-column layout is gated behind a min-width media query, so mobile/tablet keep the original single-column stack', () => {
  assert.match(cartSource, /@media \(min-width: 900px\) \{\s*\n\s*\.cart-summary:not\(\[hidden\]\) \{\s*\n\s*flex-direction: row;/);
});

test('the desktop order-summary column uses position: sticky, never fixed', () => {
  const desktopColumnBlock = cartSource.match(/\.cart-summary-column \{[\s\S]*?\}/)[0];
  assert.match(desktopColumnBlock, /position: sticky;/);
  assert.doesNotMatch(desktopColumnBlock, /position: fixed;/);
});
