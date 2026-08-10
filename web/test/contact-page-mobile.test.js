import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Fix for a real live-site bug: at ~320px, the white contact card was
// slightly too wide, clipping its right edge. contact.astro can't be
// imported by plain `node --test` (Astro pages aren't importable — see
// cart-checkout.test.js), so these tests read the real source directly.
//
// Two independent root causes, both confirmed via live DOM measurement:
//
// 1. .contact-main (same shape as .product in pages/books/[slug].astro —
//    see that file's test for the full explanation) is a flex item of the
//    shared <main>, and lacked an explicit width alongside its
//    max-width + margin: 0 auto centering pattern, so it sized itself
//    from content instead of the viewport.
//
// 2. .contact-grid's mobile rule used bare `grid-template-columns: 1fr`.
//    Bare `1fr` is shorthand for `minmax(auto, 1fr)` — the implicit
//    `auto` minimum let .contact-form-panel's content (the widest being
//    the "Reason for Contact" <select>, whose longest option is
//    "Collaboration or Partnership") force the track wider than the
//    viewport. The desktop rule just below already avoids this exact
//    failure mode with an explicit `minmax(0, ...)` — the mobile rule now
//    uses the same established pattern.

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.dirname(here);
const source = readFileSync(path.join(webRoot, 'src/pages/contact.astro'), 'utf8');

test('.contact-main has width: 100% alongside max-width + margin: 0 auto — fix #1', () => {
  const rule = source.match(/\.contact-main \{[\s\S]*?\n {2}\}/)[0];
  assert.match(rule, /width: 100%;/);
  assert.match(rule, /max-width: 1040px;/);
  assert.match(rule, /margin: 0 auto;/);
});

test('.contact-grid uses minmax(0, 1fr) at mobile, not bare 1fr — fix #2', () => {
  const rule = source.match(/\.contact-grid \{[\s\S]*?\n {2}\}/)[0];
  assert.match(rule, /grid-template-columns: minmax\(0, 1fr\);/);
  assert.doesNotMatch(rule, /grid-template-columns: 1fr;/);
});

test('the desktop contact-grid rule (860px+) is unchanged — two columns, same minmax ratio', () => {
  const desktopBlock = source.match(/@media \(min-width: 860px\) \{\s*\n\s*\.contact-grid \{[\s\S]*?\n {4}\}/)[0];
  assert.match(desktopBlock, /grid-template-columns: minmax\(0, 1\.5fr\) minmax\(0, 1fr\);/);
});

test('form controls (input/select/textarea) stretch to their container via flex-column default, never a fixed pixel width', () => {
  const controlsRule = source.match(/input,\s*\n\s*select,\s*\n\s*textarea \{[\s\S]*?\}/)[0];
  assert.doesNotMatch(controlsRule, /(?<!min-)width:\s*\d/);
  const fieldRule = source.match(/\.field \{[\s\S]*?\}/)[0];
  assert.match(fieldRule, /display: flex;/);
  assert.match(fieldRule, /flex-direction: column;/);
});

test('the submit button and all five reason options remain present and unchanged', () => {
  assert.match(source, /id="submit-button" class="submit-button">Send</);
  for (const label of ['General Inquiry', 'Feedback or Review', 'Collaboration or Partnership', 'Bulk Order / Retail', 'Support or Issue']) {
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('contact form submission logic (submitContactForm wiring) is untouched', () => {
  assert.match(source, /import \{ submitContactForm \} from '\.\.\/lib\/api';/);
  assert.match(source, /await submitContactForm\(payload\);/);
});
