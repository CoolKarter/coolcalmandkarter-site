import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Phase 14C — my-orders.astro's inline <script> can't be imported by
// plain `node --test` (Astro pages aren't importable, same constraint as
// cart.astro — see cart-checkout.test.js and book-catalog.test.js), so
// these tests read the real source directly. The underlying request/
// response classification (200 -> authenticated, 401 -> signed-out, other
// -> error) is already covered end-to-end against real Response objects
// in orders-access-response.test.js; what's specific to this file is that
// my-orders.astro's checkSession() actually branches on those states
// correctly, makes exactly one request, and never exposes session/cookie
// implementation detail in customer-facing copy.

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.dirname(here);
const source = readFileSync(path.join(webRoot, 'src/pages/my-orders.astro'), 'utf8');

test('a signed-out (401) result shows the access/login panel', () => {
  assert.match(
    source,
    /if \(result\.state === 'signed-out'\) \{\s*\n\s*showOnly\('access'\);\s*\n\s*return;\s*\n\s*\}/,
  );
});

test('an authenticated (200) result shows the authenticated panel and renders the returned orders', () => {
  assert.match(source, /showOnly\('authenticated'\);\s*\n\s*renderOrders\(result\.orders\);/);
});

test('an error result shows a distinct error panel, never silently falls back to signed-out or authenticated', () => {
  assert.match(
    source,
    /if \(result\.state === 'error'\) \{\s*\n\s*showOnly\('error'\);\s*\n\s*return;\s*\n\s*\}/,
  );
});

test('the initial load calls fetchMyOrdersWithRetry() exactly once — the bounded internal retry (Phase 14C1) lives inside that call, this is never a second, separate preliminary session-check request from this file', () => {
  // Excludes comment lines — the single call site is asserted precisely,
  // not just any textual mention (a doc comment above it also explains
  // the retry policy in prose).
  const codeOnly = source
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  const matches = codeOnly.match(/fetchMyOrdersWithRetry\(\)/g) ?? [];
  assert.equal(matches.length, 1, `expected exactly one fetchMyOrdersWithRetry() call, found ${matches.length}`);

  // And the plain single-attempt fetchMyOrders() is never called from
  // this file — the retry-aware version is the only one this page uses.
  assert.doesNotMatch(codeOnly, /[^.]fetchMyOrders\(\)/);
});

test('the loading panel is revealed only after a short delay, so a fast response never flashes it', () => {
  assert.match(source, /const LOADING_REVEAL_DELAY_MS = 200;/);
  assert.match(source, /window\.setTimeout\(\(\) => \{\s*\n\s*showOnly\('loading'\);/);
  assert.match(source, /window\.clearTimeout\(revealTimer\);/);
});

test('the reveal timer is cleared before branching on the result, so a slow-but-already-resolved response can never show a stray loading flash afterward', () => {
  const checkSessionBody = source.match(/async function checkSession\(\)[\s\S]*?\n\s*\}\n/)[0];
  const clearIndex = checkSessionBody.indexOf('window.clearTimeout(revealTimer);');
  const branchIndex = checkSessionBody.indexOf("result.state === 'signed-out'");
  assert.ok(clearIndex > -1 && branchIndex > -1, 'expected both the clear call and the state branch to be present');
  assert.ok(clearIndex < branchIndex, 'expected clearTimeout to run before branching on result.state');
});

test('customer-facing loading copy avoids technical session/auth terminology', () => {
  const loadingPanelMatch = source.match(/<div id="my-orders-loading"[\s\S]*?<\/div>/);
  assert.ok(loadingPanelMatch, 'expected to find the loading panel markup');
  const loadingPanelMarkup = loadingPanelMatch[0];
  assert.doesNotMatch(loadingPanelMarkup, /session/i);
  assert.doesNotMatch(loadingPanelMarkup, /checking/i);
  assert.match(loadingPanelMarkup, /Loading your orders/);

  const announceCall = source.match(/announce\('Loading your orders…'\);/);
  assert.ok(announceCall, 'expected the live-region announcement to use the same non-technical copy');
});

test('no client-side storage of credentials or session tokens — auth relies solely on the HttpOnly cookie sent by fetch', () => {
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /sessionStorage/);
  assert.doesNotMatch(source, /document\.cookie/);
});

// ---- Phase 14C1: rapid double-click / overlapping-request guard ----

test('checkSession() guards against overlapping calls (e.g. a rapid double-click on Try Again) with an in-flight flag', () => {
  assert.match(source, /let sessionCheckInFlight = false;/);
  assert.match(source, /if \(sessionCheckInFlight\) return;/);
  assert.match(source, /sessionCheckInFlight = true;/);
  assert.match(source, /sessionCheckInFlight = false;/);
});

test('the Try Again button is disabled while a check is in flight and re-enabled afterward, in a finally block so it is never left stuck disabled', () => {
  const checkSessionBody = source.match(/async function checkSession\(\)[\s\S]*?void checkSession\(\);/)[0];
  assert.match(checkSessionBody, /errorRetry\.disabled = true;/);
  assert.match(checkSessionBody, /\} finally \{[\s\S]*?errorRetry\.disabled = false;/);
});
