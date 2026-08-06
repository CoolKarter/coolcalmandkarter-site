'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidSessionId, verifyCheckoutSession } = require('../lib/verify-checkout-session');

test('isValidSessionId accepts a well-formed Stripe Checkout Session ID', () => {
  assert.equal(isValidSessionId('cs_test_a1B2c3D4e5F6g7H8i9J0'), true);
  assert.equal(isValidSessionId('cs_live_a1B2c3D4e5F6g7H8i9J0'), true);
});

test('isValidSessionId rejects missing, empty, or malformed values', () => {
  assert.equal(isValidSessionId(undefined), false);
  assert.equal(isValidSessionId(''), false);
  assert.equal(isValidSessionId('not-a-session-id'), false);
  assert.equal(isValidSessionId('cs_short'), false);
  assert.equal(isValidSessionId('cs_test_has spaces'), false);
  assert.equal(isValidSessionId('cs_test_has/slash'), false);
  assert.equal(isValidSessionId(12345), false);
  assert.equal(isValidSessionId(['cs_test_a1B2c3D4e5F6g7H8i9J0']), false);
});

test('returns 400 for a missing session_id, without calling Stripe', async () => {
  let called = false;
  const stripeClient = {
    checkout: { sessions: { retrieve: async () => { called = true; } } },
  };
  const result = await verifyCheckoutSession({ sessionId: undefined, stripeClient });
  assert.equal(result.status, 400);
  assert.equal(called, false);
});

test('returns 400 for a malformed session_id, without calling Stripe', async () => {
  let called = false;
  const stripeClient = {
    checkout: { sessions: { retrieve: async () => { called = true; } } },
  };
  const result = await verifyCheckoutSession({ sessionId: '<script>alert(1)</script>', stripeClient });
  assert.equal(result.status, 400);
  assert.equal(called, false);
});

test('returns verified: true for a Stripe-confirmed paid and complete session', async () => {
  const stripeClient = {
    checkout: {
      sessions: {
        retrieve: async (id) => {
          assert.equal(id, 'cs_test_a1B2c3D4e5F6g7H8i9J0');
          return {
            id,
            status: 'complete',
            payment_status: 'paid',
            // Extra fields a real Stripe session would carry, to prove
            // none of this leaks into the response.
            customer_details: { email: 'reader@example.com', name: 'Reader' },
            payment_method_types: ['card'],
            amount_total: 999,
          };
        },
      },
    },
  };

  const result = await verifyCheckoutSession({ sessionId: 'cs_test_a1B2c3D4e5F6g7H8i9J0', stripeClient });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { verified: true, paymentStatus: 'paid', sessionStatus: 'complete' });
});

test('returns verified: false for an unpaid/incomplete session', async () => {
  const stripeClient = {
    checkout: {
      sessions: {
        retrieve: async () => ({ status: 'open', payment_status: 'unpaid' }),
      },
    },
  };

  const result = await verifyCheckoutSession({ sessionId: 'cs_test_a1B2c3D4e5F6g7H8i9J0', stripeClient });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { verified: false, paymentStatus: 'unpaid', sessionStatus: 'open' });
});

test('returns 404 when Stripe retrieval fails (nonexistent/invalid session), without leaking the internal error', async () => {
  const stripeClient = {
    checkout: {
      sessions: {
        retrieve: async () => {
          throw new Error('No such checkout.session: cs_test_a1B2c3D4e5F6g7H8i9J0 (internal Stripe detail)');
        },
      },
    },
  };

  const result = await verifyCheckoutSession({ sessionId: 'cs_test_a1B2c3D4e5F6g7H8i9J0', stripeClient });
  assert.equal(result.status, 404);
  assert.equal(result.body.error, 'Checkout session not found.');
  assert.doesNotMatch(JSON.stringify(result.body), /internal Stripe detail/);
});

test('the minimal response never contains sensitive Stripe data', async () => {
  const stripeClient = {
    checkout: {
      sessions: {
        retrieve: async () => ({
          status: 'complete',
          payment_status: 'paid',
          customer_details: { email: 'reader@example.com', address: { line1: '123 Main St' } },
          payment_method_types: ['card'],
          amount_total: 999,
          client_secret: 'super-secret-value',
        }),
      },
    },
  };

  const result = await verifyCheckoutSession({ sessionId: 'cs_test_a1B2c3D4e5F6g7H8i9J0', stripeClient });
  const keys = Object.keys(result.body).sort();
  assert.deepEqual(keys, ['paymentStatus', 'sessionStatus', 'verified']);
  assert.doesNotMatch(JSON.stringify(result.body), /reader@example\.com|123 Main St|super-secret-value/);
});
