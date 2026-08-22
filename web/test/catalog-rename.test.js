import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Major cover refresh + two permanent title renames:
//   "Florida, Beach & Baby"   -> "Beach & Baby"          (beach-and-baby.md)
//   "Black, Beautiful & Baby" -> "Black, Proud & Baby"    (black-proud-and-baby.md)
// plus the Shop collection heading change ("The Baby Karter Collection"
// -> "Explore the Collection"). See the catalog cover-refresh/title-change
// report for the full audit. Content collection files and .astro
// pages/components can't be imported by plain `node --test` (see
// cart-checkout.test.js/product-page-mobile.test.js for the same
// constraint), so these tests read the real source directly.

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.dirname(here);
const booksDir = path.join(webRoot, 'src/content/books');

test('all 12 book content files are present, including the 2 renamed ones under their new filenames', () => {
  const files = readdirSync(booksDir).filter((f) => f.endsWith('.md'));
  assert.equal(files.length, 12);
  assert.ok(files.includes('beach-and-baby.md'), 'expected beach-and-baby.md');
  assert.ok(files.includes('black-proud-and-baby.md'), 'expected black-proud-and-baby.md');
  assert.ok(!files.includes('florida-beach-and-baby.md'), 'the old filename must no longer exist');
  assert.ok(!files.includes('black-beautiful-and-baby.md'), 'the old filename must no longer exist');
});

test('beach-and-baby.md carries the new title, alt text, and price — old title text is gone from customer-facing fields', () => {
  const content = readFileSync(path.join(booksDir, 'beach-and-baby.md'), 'utf8');
  assert.match(content, /title: "Beach & Baby"/);
  assert.match(content, /coverImageAlt: "Beach & Baby Cover"/);
  assert.match(content, /price: 999/);
  assert.doesNotMatch(content, /Florida, Beach & Baby/);
});

test('black-proud-and-baby.md carries the new title, alt text, and price — old title text is gone from customer-facing fields', () => {
  const content = readFileSync(path.join(booksDir, 'black-proud-and-baby.md'), 'utf8');
  assert.match(content, /title: "Black, Proud & Baby"/);
  assert.match(content, /coverImageAlt: "Black, Proud & Baby Cover"/);
  assert.match(content, /price: 999/);
  assert.doesNotMatch(content, /Black, Beautiful & Baby/);
});

test('both renamed books keep their original, stable coverImage asset path — only the pixels changed, not the reference', () => {
  const beach = readFileSync(path.join(booksDir, 'beach-and-baby.md'), 'utf8');
  const proud = readFileSync(path.join(booksDir, 'black-proud-and-baby.md'), 'utf8');
  assert.match(beach, /coverImage: "src\/assets\/books\/florida-beach-and-baby-cover\.webp"/);
  assert.match(proud, /coverImage: "src\/assets\/books\/black-beautiful-baby-cover\.webp"/);
});

test('every book\'s coverImage still resolves to a real file on disk after the cover refresh', () => {
  const files = readdirSync(booksDir).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    const content = readFileSync(path.join(booksDir, file), 'utf8');
    const match = content.match(/^coverImage:\s*"(.*)"$/m);
    assert.ok(match, `expected ${file} to declare a coverImage`);
    assert.ok(existsSync(path.join(webRoot, match[1])), `expected ${file}'s cover to exist at ${match[1]}`);
  }
});

test('the public/images/books parity copy stays in sync with src/assets/books for every cover', () => {
  const srcDir = path.join(webRoot, 'src/assets/books');
  const publicDir = path.join(webRoot, 'public/images/books');
  const srcFiles = readdirSync(srcDir).filter((f) => f.endsWith('.webp')).sort();
  const publicFiles = readdirSync(publicDir).filter((f) => f.endsWith('.webp')).sort();
  assert.deepEqual(srcFiles, publicFiles);
  for (const file of srcFiles) {
    const a = readFileSync(path.join(srcDir, file));
    const b = readFileSync(path.join(publicDir, file));
    assert.ok(a.equals(b), `expected ${file} to be byte-identical between src/assets/books and public/images/books`);
  }
});

test('all 12 books remain priced at $9.99 (999 cents) after the update — pricing was never touched', () => {
  const files = readdirSync(booksDir).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    const content = readFileSync(path.join(booksDir, file), 'utf8');
    assert.match(content, /^price: 999$/m, `expected ${file} to remain priced at 999`);
  }
});

test('no book content file references a Stripe Price ID — the cover/title refresh did not touch checkout security', () => {
  const files = readdirSync(booksDir).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    const content = readFileSync(path.join(booksDir, file), 'utf8');
    assert.doesNotMatch(content, /stripePriceId/i, `expected ${file} to have no stripePriceId field`);
  }
});

test('Shop heading: "Explore the Collection" replaces the old "The Baby Karter Collection" phrase', () => {
  const shopSource = readFileSync(path.join(webRoot, 'src/pages/shop.astro'), 'utf8');
  assert.match(shopSource, /<p class="shop-eyebrow">Explore the Collection<\/p>/);
  assert.doesNotMatch(shopSource, /The Baby Karter Collection/);
});

test('other legitimate "Baby Karter" references elsewhere on the site are untouched by the heading change', () => {
  // FinalCta.astro's "Explore the collection of Baby Karter adventures" and
  // similar character-name/brand-copy mentions are a DIFFERENT phrase from
  // the exact old heading and were intentionally left alone — this proves
  // the change stayed narrowly scoped to the one heading, not a
  // site-wide word-ban.
  const finalCta = readFileSync(path.join(webRoot, 'src/components/FinalCta.astro'), 'utf8');
  assert.match(finalCta, /Baby Karter/);
});

test('the homepage featured-books list references the renamed book by its new stable slug', () => {
  const indexSource = readFileSync(path.join(webRoot, 'src/pages/index.astro'), 'utf8');
  assert.match(indexSource, /'black-proud-and-baby'/);
  assert.doesNotMatch(indexSource, /'black-beautiful-and-baby'/);
});

test('BookCard\'s fallback-eyebrow lookup keys were updated to the new slugs, so the fallback still matches after the rename', () => {
  const bookCardSource = readFileSync(path.join(webRoot, 'src/components/BookCard.astro'), 'utf8');
  assert.match(bookCardSource, /'black-proud-and-baby':/);
  assert.match(bookCardSource, /'beach-and-baby':/);
  assert.doesNotMatch(bookCardSource, /'black-beautiful-and-baby':/);
  assert.doesNotMatch(bookCardSource, /'florida-beach-and-baby':/);
});

test('About page prose cites the new "Black, Proud & Baby" title, not the old one', () => {
  const aboutSource = readFileSync(path.join(webRoot, 'src/pages/about.astro'), 'utf8');
  assert.match(aboutSource, /Black, Proud &amp; Baby/);
  assert.doesNotMatch(aboutSource, /Black, Beautiful &amp; Baby/);
});
