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
