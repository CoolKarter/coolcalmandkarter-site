import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Fix for a real live-site bug: at narrow mobile widths (~320px) the
// primary nav (5 text links + the cart button, all in one wrapping flex
// row) couldn't fit and wrapped mid-navigation, crowding the hero below.
// Nav.astro can't be imported by plain `node --test` (Astro components
// aren't importable, same constraint as every other page/component test
// in this project — see cart-checkout.test.js and book-catalog.test.js),
// so these tests read the real source directly.
//
// The link DATA itself (all 5 expected hrefs/labels, no Admin) is already
// covered by nav-links.test.js against the actual PRIMARY_NAV_LINKS array
// both the desktop and mobile markup below render from — not duplicated
// here. What's specific to this file is the new mobile architecture: the
// hamburger toggle exists with correct accessibility attributes, the
// mobile menu renders from that same shared link source (so it can never
// drift out of sync with desktop), the cart and its destination are
// unchanged, and Admin is never exposed.

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.dirname(here);
const source = readFileSync(path.join(webRoot, 'src/components/Nav.astro'), 'utf8');

test('desktop nav (.primary-links) renders from the shared PRIMARY_NAV_LINKS source', () => {
  assert.match(source, /<nav aria-label="Primary" class="primary-links">\s*\n\s*\{links\.map\(\(link\) => <a href=\{link\.href\}>\{link\.label\}<\/a>\)\}/);
});

test('the mobile menu panel renders from the SAME links source as desktop — never a separate, driftable list', () => {
  const mobileMenuMatch = source.match(/<nav aria-label="Mobile" id="mobile-menu" class="mobile-menu" hidden>\s*\n\s*(\{links\.map\([\s\S]*?\)\})\s*\n\s*<\/nav>/);
  assert.ok(mobileMenuMatch, 'expected to find the mobile menu markup');
  assert.match(mobileMenuMatch[1], /\{links\.map\(\(link\) => <a href=\{link\.href\}>\{link\.label\}<\/a>\)\}/);
});

test('the menu toggle button has the required accessibility attributes', () => {
  const buttonMatch = source.match(/<button\s+type="button"\s+id="menu-toggle"[\s\S]*?>/);
  assert.ok(buttonMatch, 'expected to find the menu-toggle button');
  const button = buttonMatch[0];

  assert.match(button, /type="button"/);
  assert.match(button, /aria-label="Menu"/);
  assert.match(button, /aria-expanded="false"/, 'expected the button to start collapsed');
  assert.match(button, /aria-controls="mobile-menu"/, 'expected aria-controls to reference the mobile menu panel by id');
});

test('the mobile menu panel starts hidden (via the hidden attribute), matching aria-expanded="false"', () => {
  assert.match(source, /id="mobile-menu" class="mobile-menu" hidden>/);
});

test('JS toggles aria-expanded and the hidden attribute together — never out of sync', () => {
  assert.match(source, /menuToggle\.setAttribute\('aria-expanded', 'false'\);\s*\n\s*mobileMenu\.hidden = true;/);
  assert.match(source, /menuToggle\.setAttribute\('aria-expanded', 'true'\);\s*\n\s*mobileMenu\.hidden = false;/);
});

test('Escape closes the menu and returns focus to the toggle button', () => {
  assert.match(source, /event\.key === 'Escape'/);
  const escapeHandler = source.match(/document\.addEventListener\('keydown', \(event\) => \{[\s\S]*?\}\);/)[0];
  assert.match(escapeHandler, /closeMenu\(\);/);
  assert.match(escapeHandler, /menuToggle\.focus\(\);/);
});

test('clicking a link inside the mobile menu closes it', () => {
  const clickHandler = source.match(/mobileMenu\?\.addEventListener\('click', \(event\) => \{[\s\S]*?\}\);/)[0];
  assert.match(clickHandler, /closest\('a'\)/);
  assert.match(clickHandler, /closeMenu\(\);/);
});

test('no viewport-width checks or resize listeners in JS — the CSS media query alone prevents a stale open state from ever showing at desktop widths', () => {
  const scriptMatch = source.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'expected to find the script block');
  // Excludes comment lines — this checks actual code, not this file's own
  // explanatory comments (which mention "resize" while explaining its
  // deliberate absence).
  const codeOnly = scriptMatch[1]
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  assert.doesNotMatch(codeOnly, /addEventListener\(['"]resize['"]/);
  assert.doesNotMatch(codeOnly, /innerWidth/);
  assert.doesNotMatch(codeOnly, /matchMedia/);
});

test('the mobile menu panel is display:none by default, only ever shown inside a max-width media query — this is what makes a stale JS-open state harmless at desktop widths', () => {
  assert.match(source, /\.mobile-menu \{\s*\n\s*display: none;\s*\n\s*\}/);
  const mediaBlock = source.match(/@media \(max-width: 640px\) \{[\s\S]*?\n {2}\}\n<\/style>/)[0];
  assert.match(mediaBlock, /\.mobile-menu:not\(\[hidden\]\) \{\s*\n\s*display: flex;/);
});

test('the cart link is unchanged: same href, icon, and count badge, and never hidden at any breakpoint', () => {
  assert.match(source, /<a class="cart-link" href="\/cart" aria-label="View cart">/);
  assert.match(source, /<span class="cart-count" id="cart-count">0<\/span>/);
  assert.doesNotMatch(source, /\.cart-link\s*\{[^}]*display:\s*none/s);
});

test('cart badge update logic (getCartCount/CART_UPDATED_EVENT/storage sync) is untouched', () => {
  assert.match(source, /import \{ getCartCount, CART_UPDATED_EVENT, CART_STORAGE_KEY \} from '\.\.\/lib\/cart';/);
  assert.match(source, /function updateCartBadge\(\)/);
  assert.match(source, /window\.addEventListener\(CART_UPDATED_EVENT, updateCartBadge\);/);
});

test('Admin is never exposed in the public nav — no "Admin" text or /admin link anywhere in Nav.astro', () => {
  assert.doesNotMatch(source, /Admin/);
  assert.doesNotMatch(source, /\/admin/);
});

test('the primary text links are hidden and the hamburger is shown only inside the mobile media query — desktop is otherwise untouched', () => {
  const mediaBlock = source.match(/@media \(max-width: 640px\) \{[\s\S]*?\n {2}\}\n<\/style>/)[0];
  assert.match(mediaBlock, /\.primary-links \{\s*\n\s*display: none;\s*\n\s*\}/);
  assert.match(mediaBlock, /\.menu-toggle \{\s*\n\s*display: flex;\s*\n\s*\}/);
});
