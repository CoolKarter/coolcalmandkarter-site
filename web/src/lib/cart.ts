// Client-side cart, backed by localStorage. Keyed by book slug (content
// collection id) rather than title, so it stays correct if a title changes.
// This module only manages local cart state — it never calls the backend
// or Stripe itself (see lib/api.ts for that).

export const CART_STORAGE_KEY = 'cart';
export const CART_UPDATED_EVENT = 'cart:updated';

export type CartState = Record<string, number>;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function readCart(): CartState {
  if (!isBrowser()) return {};

  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const cart: CartState = {};
      for (const [slug, quantity] of Object.entries(parsed)) {
        const n = Number(quantity);
        if (typeof slug === 'string' && Number.isFinite(n) && n > 0) {
          cart[slug] = n;
        }
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
