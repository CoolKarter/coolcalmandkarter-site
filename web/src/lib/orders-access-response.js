// Pure response-shaping helpers for the My Orders authentication flow.
// Framework-free so they're unit-testable without a DOM or a real fetch —
// see web/test/orders-access-response.test.js.

/**
 * Classifies a GET /api/my-orders response by status code alone — this is
 * the authoritative session check the whole page's initial render depends
 * on. 200 means a valid session (the body's orders are used); 401 means
 * genuinely signed out (show the access form); anything else is a
 * temporary failure that must never be treated as "signed out" — showing
 * the login form for what might just be a network blip would be
 * confusing, and silently treating it as "authenticated" would be unsafe.
 */
export function classifyMyOrdersSessionStatus(status) {
  if (status === 200) return 'authenticated';
  if (status === 401) return 'signed-out';
  return 'error';
}

/**
 * The real GET /api/my-orders request/response handling — moved here
 * (rather than staying inline in web/src/lib/api.ts) specifically so it's
 * unit-testable against a real `fetch`-shaped Response object with Node's
 * built-in test runner. api.ts is TypeScript and reads `import.meta.env`
 * at module scope (a Vite-only global), so it can't be imported directly
 * by plain Node — meaning this exact logic previously had no test
 * coverage at all beyond the pure classifier above, tested only with
 * hand-typed status numbers. `fetchMyOrders()` in api.ts is now a thin
 * wrapper that calls this with the real global `fetch`; this function
 * itself never touches `import.meta.env` or any Astro/Vite-only global,
 * so it's plain, portable, and directly testable — see
 * web/test/orders-access-response.test.js.
 *
 * `fetchImpl` is injected (rather than using a bare global `fetch`
 * reference) purely so a test can supply a stub without needing to
 * monkey-patch `globalThis.fetch`.
 */
export async function loadMyOrdersList(fetchImpl) {
  try {
    const res = await fetchImpl('/api/my-orders', { credentials: 'include' });
    const state = classifyMyOrdersSessionStatus(res.status);

    if (state !== 'authenticated') {
      return { state, orders: [] };
    }

    const data = await res.json().catch(() => null);
    const orders = data && typeof data === 'object' && Array.isArray(data.orders) ? data.orders : [];
    return { state: 'authenticated', orders };
  } catch {
    return { state: 'error', orders: [] };
  }
}

/**
 * Extracts the raw magic-link token from a URL fragment string (e.g.
 * "#token=abc123"). Pure string parsing — no DOM/window access — so the
 * fragment-removal step in verify.astro can be tested independently of
 * actually manipulating browser history.
 */
export function extractMagicLinkToken(hash) {
  if (typeof hash !== 'string') return null;

  const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash;
  if (withoutHash.trim() === '') return null;

  const params = new URLSearchParams(withoutHash);
  const token = params.get('token');
  return token && token.trim() !== '' ? token.trim() : null;
}
