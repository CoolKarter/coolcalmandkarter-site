'use strict';

// Stripe Checkout Session IDs always start with "cs_" followed by an
// alphanumeric/underscore token. This is a shape check only — it never
// tries to guess whether a session actually exists, just rejects obviously
// malformed input before ever calling Stripe.
const SESSION_ID_PATTERN = /^cs_[A-Za-z0-9_]{10,255}$/;

function isValidSessionId(value) {
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value);
}

/**
 * Verifies a Stripe Checkout Session server-side — the browser is never
 * trusted to report its own payment status; this always asks Stripe
 * directly. Returns a minimal, safe result shape ({ verified,
 * paymentStatus, sessionStatus }) — never the full Stripe session object,
 * payment method details, billing address, or any other unnecessary data.
 *
 * `verified` is true only when Stripe confirms the session is both
 * `status: "complete"` and `payment_status: "paid"`.
 *
 * `stripeClient` is injected (rather than imported directly) so this stays
 * unit-testable without a real network call.
 */
async function verifyCheckoutSession({ sessionId, stripeClient }) {
  if (!isValidSessionId(sessionId)) {
    return { status: 400, body: { error: 'A valid session ID is required.' } };
  }

  let session;
  try {
    session = await stripeClient.checkout.sessions.retrieve(sessionId);
  } catch {
    // Stripe throws for a nonexistent/invalid session ID — treat that as
    // "not found" without leaking Stripe's internal error message.
    return { status: 404, body: { error: 'Checkout session not found.' } };
  }

  if (!session || typeof session !== 'object') {
    return { status: 502, body: { error: 'Unable to verify checkout session.' } };
  }

  const paymentStatus = typeof session.payment_status === 'string' ? session.payment_status : 'unknown';
  const sessionStatus = typeof session.status === 'string' ? session.status : 'unknown';
  const verified = sessionStatus === 'complete' && paymentStatus === 'paid';

  return {
    status: 200,
    body: { verified, paymentStatus, sessionStatus },
  };
}

module.exports = { isValidSessionId, verifyCheckoutSession, SESSION_ID_PATTERN };
