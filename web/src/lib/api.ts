// Centralized API access — every fetch to the Express backend (server/server.js)
// should go through here instead of hardcoding the Render URL in page code.
import { extractCheckoutUrl } from './checkout-response.js';
import { parseSessionStatusResponse, VERIFICATION_FAILURE } from './session-status-response.js';
import { loadMyOrdersList } from './orders-access-response.js';

const API_BASE_URL = import.meta.env.PUBLIC_API_BASE_URL;

export interface ContactFormPayload {
  name: string;
  email: string;
  reason: string;
  subject: string;
  message: string;
}

export async function submitContactForm(payload: ContactFormPayload): Promise<void> {
  if (!API_BASE_URL) {
    throw new Error('The contact form is not configured. Please try again later.');
  }

  const res = await fetch(`${API_BASE_URL}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let message = 'There was a problem sending your message. Please try again later.';
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // response wasn't JSON — fall back to the default message
    }
    throw new Error(message);
  }
}

export interface CheckoutItem {
  slug: string;
  quantity: number;
}

/**
 * Creates a Checkout Session via the secure /api/checkout/session endpoint
 * and returns the validated Stripe Checkout URL to redirect to. Sends only
 * { items: [{ slug, quantity }] } — never a Stripe Price ID, title, or
 * price. Throws with a user-facing message on any failure (network error,
 * validation rejection, or a response that doesn't contain a valid HTTPS
 * stripe.com Checkout URL) — the caller is responsible for catching this
 * and showing it, and must not redirect unless this resolves successfully.
 */
export async function createCheckoutSession(items: CheckoutItem[]): Promise<string> {
  if (!API_BASE_URL) {
    throw new Error('Checkout is not configured. Please try again later.');
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/checkout/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
  } catch {
    // fetch() itself threw (network failure, blocked CORS preflight, etc.)
    // — never surface the raw browser error text to the user.
    throw new Error('There was a problem starting checkout. Please try again.');
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // response wasn't JSON — data stays null, handled below
  }

  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : 'There was a problem starting checkout. Please try again.';
    throw new Error(message);
  }

  const url = extractCheckoutUrl(data);
  if (!url) {
    throw new Error('Checkout could not be started. Please try again.');
  }

  return url;
}

export interface CheckoutVerification {
  verified: boolean;
  paymentStatus: string | null;
  sessionStatus: string | null;
}

/**
 * Verifies a Checkout Session server-side via the secure
 * /api/checkout/session-status endpoint. Never trusts the browser's own
 * idea of payment status — this is the only source of truth the success
 * page is allowed to act on. Unlike submitContactForm/createCheckoutSession,
 * this never throws: a network error, a non-2xx response, or a malformed
 * response body all resolve to the same safe "not verified" result, since
 * that's itself a normal, expected state the page needs to render, not an
 * exceptional one.
 */
export async function verifyCheckoutSession(sessionId: string): Promise<CheckoutVerification> {
  if (!API_BASE_URL || typeof sessionId !== 'string' || sessionId.trim() === '') {
    return VERIFICATION_FAILURE;
  }

  let status: number;
  let data: unknown = null;
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/checkout/session-status?session_id=${encodeURIComponent(sessionId)}`,
    );
    status = res.status;
    data = await res.json().catch(() => null);
  } catch {
    return VERIFICATION_FAILURE;
  }

  return parseSessionStatusResponse(status, data);
}

// ==========================================================================
// My Orders — secure passwordless customer access (Phase 13D).
//
// Every function below deliberately uses a RELATIVE same-origin `/api/...`
// path, never `API_BASE_URL` — these requests depend on the browser
// treating them as same-origin so the HttpOnly session cookie set by the
// backend is actually stored/sent (see Phase 13C's report and
// web/scripts/generate-redirects.mjs for the Netlify proxy that makes
// `/api/*` on this site's own origin transparently reach the backend).
// Existing checkout/contact/newsletter calls above are untouched — they
// have no session to carry and keep using API_BASE_URL as before.
// ==========================================================================

export interface OrdersAccessRequestResult {
  ok: boolean;
  message: string;
}

/**
 * Requests a My Orders magic link for the given email. Always resolves —
 * never throws — with whatever generic message the backend returns,
 * unchanged: the frontend never decides or displays anything about
 * whether that email actually has orders, only relays the backend's
 * response verbatim (see server/lib/process-orders-access-request.js).
 */
export async function requestOrdersAccess(email: string): Promise<OrdersAccessRequestResult> {
  const fallbackMessage = "If orders exist for that email, we've sent a secure access link.";

  try {
    const res = await fetch('/api/orders/access/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data: unknown = await res.json().catch(() => null);
    const message =
      data && typeof data === 'object' && typeof (data as { message?: unknown }).message === 'string'
        ? (data as { message: string }).message
        : null;
    const error =
      data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : null;

    if (res.ok) {
      return { ok: true, message: message ?? fallbackMessage };
    }
    // Only a genuinely malformed email produces a non-generic response
    // (ordinary input validation, not an enumeration signal) — see the
    // backend's exact contract.
    return { ok: false, message: error ?? 'Please enter a valid email address.' };
  } catch {
    return { ok: false, message: 'There was a problem sending your request. Please try again.' };
  }
}

/**
 * Exchanges a raw magic-link token (read from the URL fragment by the
 * calling page) for a session — the backend responds by setting the
 * HttpOnly session cookie; this function only reports whether that
 * succeeded, it never sees or handles the cookie itself (JS can't, by
 * design). Never throws — a network failure and an invalid/expired token
 * both resolve to `false`, and the caller shows the identical generic
 * "no longer valid" state either way (see verify.astro).
 */
export async function verifyOrdersAccessToken(token: string): Promise<boolean> {
  try {
    const res = await fetch('/api/orders/access/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface CustomerOrderItemView {
  slug: string | null;
  title: string | null;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
}

export interface CustomerOrderAddressView {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
}

export interface CustomerOrderView {
  orderNumber: string | null;
  date: string | null;
  items: CustomerOrderItemView[];
  amount: number | null;
  shippingMethod: string | null;
  address: CustomerOrderAddressView | null;
  orderStatus: string;
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
}

export type MyOrdersSessionState = 'authenticated' | 'signed-out' | 'error';

export interface MyOrdersListResult {
  state: MyOrdersSessionState;
  orders: CustomerOrderView[];
}

/**
 * The authoritative session check the whole My Orders page's initial
 * render depends on: 200 means authenticated (render the returned
 * orders), 401 means genuinely signed out (show the access form), and
 * anything else is a temporary failure — never silently treated as either
 * of the other two states, so a network blip can never look like being
 * logged out, and can never look like a successful login either.
 */
export async function fetchMyOrders(): Promise<MyOrdersListResult> {
  return loadMyOrdersList(fetch) as Promise<MyOrdersListResult>;
}

/**
 * Fetches one order's full detail. Ownership is enforced entirely
 * server-side (orderNumber alone is never sufficient — see
 * server/lib/customer-orders.js); this function never assumes possession
 * of an order number grants access and simply reports null on any
 * non-2xx response (a real-but-not-yours order and a nonexistent one are
 * indistinguishable here, matching the backend's identical 404 for both).
 */
export async function fetchMyOrder(orderNumber: string): Promise<CustomerOrderView | null> {
  try {
    const res = await fetch(`/api/my-orders/${encodeURIComponent(orderNumber)}`, { credentials: 'include' });
    if (!res.ok) return null;
    const data: unknown = await res.json().catch(() => null);
    return data && typeof data === 'object' && (data as { order?: unknown }).order
      ? ((data as { order: CustomerOrderView }).order)
      : null;
  } catch {
    return null;
  }
}

/**
 * Logs out of My Orders. Always calls the server (real, server-side
 * session revocation — see server/lib/customer-session.js) rather than
 * only clearing client-side UI state; best-effort on network failure,
 * since the caller transitions the UI back to signed-out regardless.
 */
export async function logoutOrdersAccess(): Promise<void> {
  try {
    await fetch('/api/orders/access/logout', { method: 'POST', credentials: 'include' });
  } catch {
    // Best-effort — UI still returns to signed-out state either way.
  }
}
