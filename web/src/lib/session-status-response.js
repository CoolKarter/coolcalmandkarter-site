// Parses a /api/checkout/session-status response into a safe, minimal
// shape. Any malformed, unexpected, or non-2xx response is treated as a
// verification failure — never as a confirmed order. Plain JS
// (framework-free) so it's unit-testable with Node's built-in test runner
// without adding any new tooling — see web/test/session-status-response.test.js.

export const VERIFICATION_FAILURE = Object.freeze({
  verified: false,
  paymentStatus: null,
  sessionStatus: null,
});

export function parseSessionStatusResponse(status, data) {
  if (typeof status !== 'number' || status < 200 || status >= 300) {
    return VERIFICATION_FAILURE;
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return VERIFICATION_FAILURE;
  }

  if (typeof data.verified !== 'boolean') {
    return VERIFICATION_FAILURE;
  }

  return {
    verified: data.verified,
    paymentStatus: typeof data.paymentStatus === 'string' ? data.paymentStatus : null,
    sessionStatus: typeof data.sessionStatus === 'string' ? data.sessionStatus : null,
  };
}
