// Client-side cart, backed by localStorage. Keyed by book slug (content
// collection id) rather than title, so it stays correct if a title changes.
// This module only manages local cart state — it never calls the backend
// or Stripe itself (see lib/api.ts for that).

import { migrateCartSlugs } from './legacy-slug-aliases';

export const CART_STORAGE_KEY = 'cart';
export const CART_UPDATED_EVENT = 'cart:updated';

export type CartState = Record<string, number>;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/**
 * Reads the cart, migrating any legacy (pre-rename) slug to its current
 * canonical one along the way — the actual resolution/merge logic is a
 * pure function in lib/legacy-slug-aliases.js (kept framework-free there
 * so it's directly unit-testable). An HTTP redirect protects old
 * /books/<slug> URLs, but does nothing for a slug already saved in a
 * customer's cart from before the rename; without this, such an entry
 * would look "unknown" to every page that builds its product catalog from
 * the current content collection and get silently pruned (deleted),
 * losing the customer's saved item.
 */
export function readCart(): CartState {
  if (!isBrowser()) return {};

  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const { cart, migrated } = migrateCartSlugs(parsed as Record<string, unknown>);

      if (migrated) {
        // Direct write, not writeCart() — this is a background self-heal
        // triggered by reading, not a real user action, so it doesn't
        // dispatch CART_UPDATED_EVENT (same reasoning already used for
        // the unknown-slug pruning in cart.astro's render()).
        window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
      }

      return cart;
    }
    return {};
  } catch {
    return {};
  }
}

function writeCart(cart: CartState): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT, { detail: cart }));
}

export function getCartCount(cart: CartState = readCart()): number {
  return Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
}

export function addToCart(slug: string, quantity = 1): CartState {
  const cart = readCart();
  cart[slug] = (cart[slug] ?? 0) + quantity;
  writeCart(cart);
  return cart;
}

export function setQuantity(slug: string, quantity: number): CartState {
  const cart = readCart();
  if (quantity <= 0) {
    delete cart[slug];
  } else {
    cart[slug] = quantity;
  }
  writeCart(cart);
  return cart;
}

export function removeFromCart(slug: string): CartState {
  const cart = readCart();
  delete cart[slug];
  writeCart(cart);
  return cart;
}

/**
 * Empties the cart entirely. Callers must only invoke this after a
 * server-verified event (e.g. a confirmed, paid order) — never based on
 * the browser's own assumption that checkout succeeded.
 */
export function clearCart(): CartState {
  writeCart({});
  return {};
}
