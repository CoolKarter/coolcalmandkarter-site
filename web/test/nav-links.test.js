import test from 'node:test';
import assert from 'node:assert/strict';
import { PRIMARY_NAV_LINKS } from '../src/lib/nav-links.js';

// Nav.astro imports this exact array (see web/src/components/Nav.astro) —
// testing it here proves what actually renders, not a reimplementation of
// it. Astro components themselves can't be imported by plain Node, which
// is why the link data lives in its own plain-JS module.
//
// Responsive/structural behavior (no horizontal overflow, wrapping onto a
// second line at narrow widths) was verified live in-browser at 375/768/
// 1280px during this change and isn't re-asserted here — Nav.astro's CSS
// already handled a variable-length link list via flex-wrap before this
// change, and no CSS was touched.

test('primary nav includes all four original links, unchanged', () => {
  const originalHrefs = ['/', '/shop', '/about', '/contact'];
  const originalLabels = ['Home', 'Shop', 'About', 'Contact'];
  for (let i = 0; i < originalHrefs.length; i++) {
    const link = PRIMARY_NAV_LINKS.find((l) => l.href === originalHrefs[i]);
    assert.ok(link, `expected a link to ${originalHrefs[i]}`);
    assert.equal(link.label, originalLabels[i]);
  }
});

test('primary nav includes a "My Orders" link pointing at /my-orders', () => {
  const link = PRIMARY_NAV_LINKS.find((l) => l.label === 'My Orders');
  assert.ok(link, 'expected a "My Orders" link to be present');
  assert.equal(link.href, '/my-orders');
});

test('primary nav has exactly five links, in the expected order', () => {
  assert.deepEqual(
    PRIMARY_NAV_LINKS.map((l) => l.label),
    ['Home', 'Shop', 'About', 'Contact', 'My Orders'],
  );
});
