// Global storefront checkout kill-switch — the frontend half of
// STORE_CHECKOUT_ENABLED (see server/lib/store-checkout-status.js for the
// backend's identical parsing rule and the authoritative enforcement).
// This controls CUSTOMER-FACING purchase UI only (product-page purchase
// controls, the Shop "Out of Stock" badge, the cart Checkout button) — it
// is never a security boundary by itself. Even if this were somehow
// misconfigured true while the backend is false, POST /api/checkout/session
// still refuses to create a Stripe Checkout Session; see
// web/src/lib/api.ts's createCheckoutSession(), which surfaces that
// rejection's message to the customer either way.
//
// Fails closed, same as the backend: only the exact string "true" enables
// checkout UI. Astro/Vite's import.meta.env always yields raw strings (or
// undefined if unset) for PUBLIC_-prefixed variables, so callers pass
// import.meta.env.PUBLIC_STORE_CHECKOUT_ENABLED directly — kept out of
// this file so the parsing logic itself stays plain and Node-testable
// (import.meta.env can't be read outside Vite/Astro's own runtime).
export function isStoreCheckoutEnabled(rawValue) {
  return rawValue === 'true';
}
