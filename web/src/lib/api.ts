// Centralized API access — every fetch to the Express backend (server/server.js)
// should go through here instead of hardcoding the Render URL in page code.
import { extractCheckoutUrl } from './checkout-response.js';
import { parseSessionStatusResponse, VERIFICATION_FAILURE } from './session-status-response.js';

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
