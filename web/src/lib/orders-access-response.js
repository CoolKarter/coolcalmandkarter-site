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
 * HTTP statuses that represent a transient, safe-to-retry failure — a
 * proxy/gateway or backend-not-ready condition (a Netlify/Render cold
 * start, or the backend's own brief "can't verify your session yet"
 * response — see server.js's GET /api/my-orders 503 branch, added in
 * Phase 14C1) rather than a genuine, deterministic application error. 500
 * is deliberately excluded: it's the generic "something is actually
 * broken" bucket the backend's final error handler falls back to (see
 * server/lib/error-response.js), and blindly retrying it would mask a
 * real bug instead of surfacing it.
 */
const TRANSIENT_MY_ORDERS_STATUSES = new Set([502, 503, 504]);

export function isTransientMyOrdersStatus(status) {
  return TRANSIENT_MY_ORDERS_STATUSES.has(status);
}

/**
 * One real attempt at GET /api/my-orders. Returns the same `{ state,
 * orders }` shape loadMyOrdersList() has always returned, plus an
 * internal `transient` flag callers use to decide whether a retry is
 * worthwhile — a genuine network-level failure (fetch() itself rejects)
 * or one of the proxy/backend-not-ready statuses above. `transient` is
 * never true for a normal 401 or for an ordinary error status like 500 —
 * see loadMyOrdersListWithRetry() for why that boundary matters.
 */
async function attemptMyOrdersFetch(fetchImpl) {
  let res;
  try {
    res = await fetchImpl('/api/my-orders', { credentials: 'include' });
  } catch {
    return { state: 'error', orders: [], transient: true };
  }

  const state = classifyMyOrdersSessionStatus(res.status);

  if (state !== 'authenticated') {
    return { state, orders: [], transient: state === 'error' && isTransientMyOrdersStatus(res.status) };
  }

  const data = await res.json().catch(() => null);
  const orders = data && typeof data === 'object' && Array.isArray(data.orders) ? data.orders : [];
  return { state: 'authenticated', orders, transient: false };
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
 * monkey-patch `globalThis.fetch`. Always a single attempt — see
 * loadMyOrdersListWithRetry() below for the bounded-retry variant the My
 * Orders page's initial load actually uses (Phase 14C1).
 */
export async function loadMyOrdersList(fetchImpl) {
  const { transient, ...result } = await attemptMyOrdersFetch(fetchImpl);
  return result;
}

/**
 * The initial My Orders load, with ONE bounded automatic retry — and only
 * for a transient failure (see isTransientMyOrdersStatus() and
 * attemptMyOrdersFetch() above): a 502/503/504 from a proxy or a backend
 * that isn't ready to check the session yet, or a genuine network-level
 * fetch failure. Never retries a normal 401 (that's the real, final
 * "signed out" answer) and never retries an ordinary error status like
 * 500 (retrying a deterministic backend bug would hide it instead of
 * surfacing it — Phase 14C1 was explicit about this). Exactly one retry,
 * after a short fixed delay, never a loop — each attempt is fully awaited
 * before the next one starts, so this can never produce overlapping
 * requests. `retryDelayMs`/`sleepImpl` are both injectable so tests never
 * have to wait on a real timer.
 */
export async function loadMyOrdersListWithRetry(
  fetchImpl,
  { retryDelayMs = 700, sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {},
) {
  const first = await attemptMyOrdersFetch(fetchImpl);
  if (!first.transient) {
    const { transient, ...result } = first;
    return result;
  }

  await sleepImpl(retryDelayMs);
  const { transient, ...second } = await attemptMyOrdersFetch(fetchImpl);
  return second;
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
