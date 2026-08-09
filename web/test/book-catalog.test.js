import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Phase 14B — proves invariants about the actual 12 committed book content
// files directly from disk, since astro:content (getCollection) is only
// available inside Astro's own build/dev runtime, not a plain `node --test`
// process — same constraint every other content-adjacent piece of logic in
// this project works around by keeping the testable part framework-free.
// This intentionally does NOT re-implement a YAML parser: it extracts only
// the specific known scalar fields this suite actually checks, via plain
// line matching — sufficient for this content shape (flat frontmatter plus
// a couple of multi-line ">-" description blocks this file never touches).

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.dirname(here);
const booksDir = path.join(webRoot, 'src/content/books');

function extractFrontmatterField(content, field) {
  const match = content.match(new RegExp(`^${field}:\\s*(.*)$`, 'm'));
  if (!match) return undefined;
  return match[1].trim().replace(/^"(.*)"$/, '$1');
}

function loadBook(filename) {
  const content = readFileSync(path.join(booksDir, filename), 'utf8');
  return {
    slug: filename.replace(/\.md$/, ''),
    title: extractFrontmatterField(content, 'title'),
    price: extractFrontmatterField(content, 'price'),
    availability: extractFrontmatterField(content, 'availability'),
    coverImage: extractFrontmatterField(content, 'coverImage'),
    // undefined when the line is genuinely absent (the schema then
    // defaults it to true at build time) vs the literal string "false"
    // when a book explicitly opts out.
    checkoutEnabled: extractFrontmatterField(content, 'checkoutEnabled'),
    hasStripePriceId: /^stripePriceId:/m.test(content),
  };
}

const bookFiles = readdirSync(booksDir).filter((f) => f.endsWith('.md'));
const books = bookFiles.map(loadBook);

const EXPECTED_DISABLED_SLUGS = [
  'abuelita-and-baby',
  'black-white-and-baby',
  'christmas-and-baby',
  'halloween-and-baby',
  'mexican-and-baby',
  'puertorican-boricua-and-baby',
  'thanksgiving-and-baby',
].sort();

test('there are exactly 12 book content files', () => {
  assert.equal(books.length, 12);
});

test('every book has a unique slug (derived from a unique filename)', () => {
  const slugs = books.map((b) => b.slug);
  assert.equal(new Set(slugs).size, 12);
});

test('every book is priced at $9.99 (999 cents) — no inconsistent pricing', () => {
  for (const book of books) {
    assert.equal(book.price, '999', `expected ${book.slug} to be priced at 999`);
  }
});

test('every book has a real title', () => {
  for (const book of books) {
    assert.ok(book.title && book.title.trim() !== '', `expected ${book.slug} to have a title`);
  }
});

test('every book is marked available (none are "coming-soon")', () => {
  for (const book of books) {
    assert.equal(book.availability, 'available', `expected ${book.slug} to be available`);
  }
});

test('every book\'s coverImage resolves to a real file on disk — no missing/broken covers', () => {
  for (const book of books) {
    assert.ok(book.coverImage, `expected ${book.slug} to declare a coverImage`);
    const resolved = path.join(webRoot, book.coverImage);
    assert.ok(existsSync(resolved), `expected ${book.slug}'s cover to exist at ${book.coverImage}`);
  }
});

test('no book content file declares a stripePriceId — Phase 14B removed it from the frontend entirely', () => {
  for (const book of books) {
    assert.equal(book.hasStripePriceId, false, `expected ${book.slug} to have no stripePriceId field`);
  }
});

test('checkoutEnabled behavior matches the current, intentional 5-enabled/7-disabled split — no accidental drift', () => {
  const disabledSlugs = books
    .filter((b) => b.checkoutEnabled === 'false')
    .map((b) => b.slug)
    .sort();
  assert.deepEqual(disabledSlugs, EXPECTED_DISABLED_SLUGS);

  const explicitlyEnabledOrDefaulted = books.filter((b) => b.checkoutEnabled !== 'false');
  assert.equal(explicitlyEnabledOrDefaulted.length, 5);
});

test('a disabled book never has a stray checkoutEnabled: true and vice versa (each book states its intent exactly once, or not at all)', () => {
  for (const book of books) {
    // A field either isn't present (undefined -> schema default true) or is
    // the literal string "false" — this project never writes
    // "checkoutEnabled: true" explicitly for the originally-live books.
    assert.ok(book.checkoutEnabled === undefined || book.checkoutEnabled === 'false', `unexpected checkoutEnabled value on ${book.slug}: ${book.checkoutEnabled}`);
  }
});
