// API client for the Phase 13F private admin orders dashboard. Every call
// is a RELATIVE /api/... path (same-origin, via the Netlify proxy already
// built for Phase 13D) with `credentials: 'include'` so the HttpOnly
// AdminSession cookie is sent automatically — this module never stores,
// reads, or forwards ADMIN_PASSWORD or a Basic Auth string itself; the
// browser's cookie jar is the only thing carrying the credential, and this
// code never touches it directly (HttpOnly cookies aren't JS-readable by
// design). `fetchImpl` is injectable (defaulting to the real global
// `fetch`) purely so tests can supply a stub without monkey-patching
// globalThis.fetch — see web/test/admin-api.test.js.

async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Logs in with the fixed "admin" username and a submitted password.
 * Never throws — a network failure and an invalid-credentials response
 * both resolve to `{ ok: false, error }`, since the caller (the login
 * form) needs to render both the same way: stay on the login screen and
 * show a message. Never stores the password anywhere; it exists only in
 * this call's request body.
 */
export async function loginAdmin({ username, password }, fetchImpl = fetch) {
  try {
    const res = await fetchImpl('/api/admin/session/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });
    const data = await parseJsonSafe(res);
    if (res.ok) return { ok: true };
    const error = data && typeof data.error === 'string' ? data.error : 'Invalid username or password.';
    return { ok: false, error };
  } catch {
    return { ok: false, error: 'There was a problem signing in. Please try again.' };
  }
}

/** Logs out. Best-effort — the caller returns the UI to the login screen regardless of network outcome, same philosophy as logoutOrdersAccess in api.ts. */
export async function logoutAdmin(fetchImpl = fetch) {
  try {
    await fetchImpl('/api/admin/session/logout', { method: 'POST', credentials: 'include' });
  } catch {
    // Best-effort — UI still returns to the login screen either way.
  }
}

/**
 * Checks whether a valid admin session currently exists. Never throws —
 * a network failure is treated as "not authenticated" (fail closed: the
 * dashboard shows the login screen, never silently assumes access).
 */
export async function getAdminSessionStatus(fetchImpl = fetch) {
  try {
    const res = await fetchImpl('/api/admin/session', { credentials: 'include' });
    const data = await parseJsonSafe(res);
    return { authenticated: Boolean(data && data.authenticated === true) };
  } catch {
    return { authenticated: false };
  }
}

/**
 * Fetches the full order list. Distinguishes a session-expiry 401 (the
 * caller should bounce back to the login screen) from any other failure
 * (the caller shows a generic retry state) via `status`.
 */
export async function fetchAdminOrders(fetchImpl = fetch) {
  try {
    const res = await fetchImpl('/api/admin/orders', { credentials: 'include' });
    if (!res.ok) {
      const data = await parseJsonSafe(res);
      return { ok: false, status: res.status, error: data?.error || 'Unable to load orders.' };
    }
    const data = await parseJsonSafe(res);
    const orders = data && Array.isArray(data.orders) ? data.orders : [];
    return { ok: true, orders };
  } catch {
    return { ok: false, status: 0, error: 'There was a problem loading orders.' };
  }
}

/** Fetches one order's full admin detail by order number. */
export async function fetchAdminOrder(orderNumber, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`/api/admin/orders/${encodeURIComponent(orderNumber)}`, { credentials: 'include' });
    if (!res.ok) {
      const data = await parseJsonSafe(res);
      return { ok: false, status: res.status, error: data?.error || 'Unable to load this order.' };
    }
    const data = await parseJsonSafe(res);
    return data && data.order ? { ok: true, order: data.order } : { ok: false, status: res.status, error: 'Unable to load this order.' };
  } catch {
    return { ok: false, status: 0, error: 'There was a problem loading this order.' };
  }
}

/**
 * Applies a status/tracking update. `patchBody` is sent verbatim (already
 * shaped by the caller — see buildShippedPatchBody in
 * admin-order-display.js) — this function never invents or drops fields.
 * `status` on failure lets the caller distinguish 401 (session expired —
 * show login), 409 (stale — reload the order), and 400/500 (generic error
 * message) without this module deciding UI behavior itself.
 */
export async function updateAdminOrder(orderNumber, patchBody, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`/api/admin/orders/${encodeURIComponent(orderNumber)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(patchBody),
    });
    const data = await parseJsonSafe(res);
    if (!res.ok) {
      return { ok: false, status: res.status, error: data?.error || 'Unable to update this order.' };
    }
    return data && data.order ? { ok: true, order: data.order } : { ok: false, status: res.status, error: 'Unable to update this order.' };
  } catch {
    return { ok: false, status: 0, error: 'There was a problem updating this order.' };
  }
}

/** Resends the original order-confirmation email. Never accepts/sends a caller-supplied destination — the backend always uses the order's own stored email. */
export async function resendAdminOrderConfirmation(orderNumber, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`/api/admin/orders/${encodeURIComponent(orderNumber)}/resend-confirmation`, {
      method: 'POST',
      credentials: 'include',
    });
    const data = await parseJsonSafe(res);
    if (!res.ok) {
      return { ok: false, status: res.status, error: data?.error || 'Email could not be sent.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 0, error: 'Email could not be sent.' };
  }
}
