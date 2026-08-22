import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOK_SLUG_REDIRECTS, buildBookSlugRedirectsRule } from '../src/lib/book-slug-redirects.js';

test('exactly the two renamed books have a redirect entry', () => {
  assert.equal(BOOK_SLUG_REDIRECTS.length, 2);
});

test('the old "Florida, Beach & Baby" URL redirects to the new "Beach & Baby" URL', () => {
  const entry = BOOK_SLUG_REDIRECTS.find((r) => r.from === '/books/florida-beach-and-baby/');
  assert.ok(entry, 'expected a redirect entry for the old Florida, Beach & Baby URL');
  assert.equal(entry.to, '/books/beach-and-baby/');
});

test('the old "Black, Beautiful & Baby" URL redirects to the new "Black, Proud & Baby" URL', () => {
  const entry = BOOK_SLUG_REDIRECTS.find((r) => r.from === '/books/black-beautiful-and-baby/');
  assert.ok(entry, 'expected a redirect entry for the old Black, Beautiful & Baby URL');
  assert.equal(entry.to, '/books/black-proud-and-baby/');
});

test('buildBookSlugRedirectsRule() produces one Netlify-format "from  to  301" line per entry', () => {
  const rule = buildBookSlugRedirectsRule();
  const lines = rule.trim().split('\n');
  assert.equal(lines.length, 2);
  for (const line of lines) {
    assert.match(line, /^\/books\/[a-z-]+\/ {2}\/books\/[a-z-]+\/ {2}301$/);
  }
});

test('every redirect uses a permanent 301 status, never a temporary 302', () => {
  const rule = buildBookSlugRedirectsRule();
  assert.doesNotMatch(rule, /\s302\b/);
  assert.match(rule, /\s301$/m);
});

test('no redirect points a URL at itself', () => {
  for (const { from, to } of BOOK_SLUG_REDIRECTS) {
    assert.notEqual(from, to);
  }
});
