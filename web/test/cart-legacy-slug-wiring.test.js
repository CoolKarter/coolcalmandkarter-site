import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Confirms lib/cart.ts actually wires in the legacy-slug migration (the
// real behavioral correctness — quantity preservation, no duplicate rows,
// the 20-item cap — is proven directly against the pure function in
// legacy-slug-aliases.test.js, and empirically via live browser testing;
// this file exists so an accidental removal of the wiring itself would
// fail a test rather than only surface as a live-site regression).
// cart.ts is TypeScript and can't be imported by plain `node --test`
// (see legacy-slug-aliases.test.js), so this reads the real source.

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.dirname(here);
const cartSource = readFileSync(path.join(webRoot, 'src/lib/cart.ts'), 'utf8');

test('readCart() delegates slug migration to the shared pure function, not a duplicated inline implementation', () => {
  assert.match(cartSource, /import \{ migrateCartSlugs \} from '\.\/legacy-slug-aliases';/);
  assert.match(cartSource, /migrateCartSlugs\(parsed as Record<string, unknown>\)/);
});

test('a migration is persisted with a direct localStorage write, never through writeCart() (which would dispatch CART_UPDATED_EVENT during a read)', () => {
  const readCartBody = cartSource.match(/export function readCart\(\): CartState \{[\s\S]*?\n\}/)[0];
  // Excludes comment lines — this checks actual code, not this function's
  // own explanatory comment (which mentions "writeCart()" while explaining
  // its deliberate absence).
  const codeOnly = readCartBody
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  assert.match(codeOnly, /if \(migrated\) \{/);
  assert.match(codeOnly, /window\.localStorage\.setItem\(CART_STORAGE_KEY, JSON\.stringify\(cart\)\);/);
  assert.doesNotMatch(codeOnly, /writeCart\(/);
});

test('cart.ts does not duplicate the alias mapping or quantity cap itself — single source of truth stays in legacy-slug-aliases.js', () => {
  assert.doesNotMatch(cartSource, /florida-beach-and-baby/);
  assert.doesNotMatch(cartSource, /black-beautiful-and-baby/);
  assert.doesNotMatch(cartSource, /MAX_ITEM_QUANTITY/);
});
