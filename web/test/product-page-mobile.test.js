import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Fix for a real live-site bug: at ~320px, product pages (e.g.
// /books/black-beautiful-and-baby) rendered ~256px wider than the
// viewport, clipping the cover/title/copy. [slug].astro can't be imported
// by plain `node --test` (Astro pages aren't importable — see
// cart-checkout.test.js), so these tests read the real source directly.
//
// Root cause (confirmed via live DOM measurement, not guessed): .product
// is a flex item of the shared <main> (tokens.css: display:flex;
// flex-direction:column). In a column flex container, width is a
// cross-axis property normally filled via align-items:stretch — but
// stretch is disabled whenever an item has an auto cross-axis margin
// (margin: 0 auto, the standard centering pattern here), so .product fell
// back to sizing itself from its own content's preferred width instead of
// the viewport. Adding width: 100% (alongside the existing max-width +
// margin: 0 auto) restores the intended "fill available width, then
// center once wider than max-width" behavior. Verified live: this single
// change took .product from 576px to a correct 320px at a 320px viewport,
// with zero downstream CSS changes needed anywhere in the nested
// cover/info/details/related tree.

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.dirname(here);
const source = readFileSync(path.join(webRoot, 'src/pages/books/[slug].astro'), 'utf8');

test('.product has width: 100% alongside max-width + margin: 0 auto — the actual fix', () => {
  const productRule = source.match(/\.product \{[\s\S]*?\n {2}\}/)[0];
  assert.match(productRule, /width: 100%;/);
  assert.match(productRule, /max-width: 1080px;/);
  assert.match(productRule, /margin: 0 auto;/);
});

test('.cover-stage still scales fluidly: width: 100% with a max-width cap, never a fixed width', () => {
  const stageRule = source.match(/\.cover-stage \{[\s\S]*?\n {2}\}/)[0];
  assert.match(stageRule, /width: 100%;/);
  assert.match(stageRule, /max-width: 340px;/);
  assert.doesNotMatch(stageRule, /(?<!max-)(?<!min-)width: \d+px/);
});

test('the shared .cover-frame img rule (tokens.css) constrains the cover image to its frame — never a fixed pixel width', () => {
  const tokens = readFileSync(path.join(webRoot, 'src/styles/tokens.css'), 'utf8');
  const imgRule = tokens.match(/\.cover-frame img \{[\s\S]*?\}/)[0];
  assert.match(imgRule, /max-width: 100%;/);
  assert.match(imgRule, /object-fit: contain;/);
});

test('the product hero stacks to a single column below 750px (cover above info/controls) and switches to two columns at 750px+', () => {
  assert.match(source, /grid-template-columns: 1fr;/);
  const desktopBlock = source.match(/@media \(min-width: 750px\) \{[\s\S]*?\n {2}\}/)[0];
  assert.match(desktopBlock, /grid-template-columns: minmax\(280px, 380px\) 1fr;/);
});

test('long book titles and copy wrap normally — no nowrap/fixed-width text elements introduced', () => {
  const h1Rule = source.match(/\.product-info h1 \{[\s\S]*?\}/)[0];
  assert.doesNotMatch(h1Rule, /white-space:\s*nowrap/);
  const shortDescRule = source.match(/\.short-description \{[\s\S]*?\}/)[0];
  assert.doesNotMatch(shortDescRule, /white-space:\s*nowrap/);
});

test('pricing/cart functionality is untouched: same data-slug/data-title wiring and addToCart import', () => {
  assert.match(source, /data-slug=\{book\.id\}/);
  assert.match(source, /data-title=\{data\.title\}/);
  assert.match(source, /import \{ addToCart \} from '\.\.\/\.\.\/lib\/cart';/);
  assert.match(source, /addToCart\(slug, quantity\);/);
});

test('the quantity stepper and buy button markup is untouched', () => {
  assert.match(source, /id="qty-decrease"/);
  assert.match(source, /id="qty-increase"/);
  assert.match(source, /id="add-to-cart-button"/);
  assert.match(source, /class="buy-button"/);
});

test('checkoutEnabled remains part of the frontend purchase gate (now ANDed with the global store switch — see store-checkout-switch.test.js) — no Stripe Price ID reference introduced', () => {
  assert.match(source, /const canAddToCart = data\.checkoutEnabled && STORE_CHECKOUT_ENABLED;/);
  assert.doesNotMatch(source, /stripePriceId/i);
});
