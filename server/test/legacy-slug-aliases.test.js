'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LEGACY_SLUG_ALIASES, resolveLegacySlug } = require('../lib/legacy-slug-aliases');

test('exactly the two renamed books have a legacy alias entry', () => {
  assert.equal(Object.keys(LEGACY_SLUG_ALIASES).length, 2);
});

test('the old "florida-beach-and-baby" slug resolves to "beach-and-baby"', () => {
  assert.equal(resolveLegacySlug('florida-beach-and-baby'), 'beach-and-baby');
});

test('the old "black-beautiful-and-baby" slug resolves to "black-proud-and-baby"', () => {
  assert.equal(resolveLegacySlug('black-beautiful-and-baby'), 'black-proud-and-baby');
});

test('an already-canonical (new) slug passes through unchanged', () => {
  assert.equal(resolveLegacySlug('beach-and-baby'), 'beach-and-baby');
  assert.equal(resolveLegacySlug('black-proud-and-baby'), 'black-proud-and-baby');
});

test('any unrelated slug passes through unchanged, never accidentally rewritten', () => {
  assert.equal(resolveLegacySlug('thanksgiving-and-baby'), 'thanksgiving-and-baby');
  assert.equal(resolveLegacySlug('not-a-real-book'), 'not-a-real-book');
});

test('does not resolve values inherited from Object.prototype (e.g. "toString", "constructor")', () => {
  assert.equal(resolveLegacySlug('toString'), 'toString');
  assert.equal(resolveLegacySlug('constructor'), 'constructor');
  assert.equal(resolveLegacySlug('hasOwnProperty'), 'hasOwnProperty');
});
