import test from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED_TRANSITIONS, ORDER_STATUSES, getAvailableActions } from '../src/lib/admin-order-transitions.js';

// This table must stay identical to server/lib/order-status.js's
// ALLOWED_TRANSITIONS — these tests assert the exact same transition set
// server/test/order-status.test.js asserts against the real backend, so a
// frontend/backend drift shows up as a failing test here, not just a
// rendering bug discovered by hand.

test('allows all six approved transitions', () => {
  assert.deepEqual(ALLOWED_TRANSITIONS.received.sort(), ['cancelled', 'processing', 'shipped']);
  assert.deepEqual(ALLOWED_TRANSITIONS.processing.sort(), ['cancelled', 'shipped']);
  assert.deepEqual(ALLOWED_TRANSITIONS.shipped, ['delivered']);
});

test('delivered and cancelled are final — no outgoing transitions', () => {
  assert.deepEqual(ALLOWED_TRANSITIONS.delivered, []);
  assert.deepEqual(ALLOWED_TRANSITIONS.cancelled, []);
});

test('ORDER_STATUSES contains exactly the five known statuses', () => {
  assert.deepEqual(ORDER_STATUSES.sort(), ['cancelled', 'delivered', 'processing', 'received', 'shipped']);
});

// ---- getAvailableActions ----

test('received order can be marked processing, shipped, or cancelled', () => {
  const actions = getAvailableActions('received').map((a) => a.status).sort();
  assert.deepEqual(actions, ['cancelled', 'processing', 'shipped']);
});

test('processing order can be marked shipped or cancelled, never back to received', () => {
  const actions = getAvailableActions('processing').map((a) => a.status).sort();
  assert.deepEqual(actions, ['cancelled', 'shipped']);
});

test('shipped order can only be marked delivered', () => {
  const actions = getAvailableActions('shipped');
  assert.deepEqual(actions.map((a) => a.status), ['delivered']);
});

test('delivered order has no available actions', () => {
  assert.deepEqual(getAvailableActions('delivered'), []);
});

test('cancelled order has no available actions', () => {
  assert.deepEqual(getAvailableActions('cancelled'), []);
});

test('a legacy/missing/unrecognized status is treated as "received"', () => {
  const forUndefined = getAvailableActions(undefined).map((a) => a.status).sort();
  const forGarbage = getAvailableActions('not-a-real-status').map((a) => a.status).sort();
  const forReceived = getAvailableActions('received').map((a) => a.status).sort();
  assert.deepEqual(forUndefined, forReceived);
  assert.deepEqual(forGarbage, forReceived);
});

test('every action has a real, non-empty human label', () => {
  for (const status of ['received', 'processing', 'shipped']) {
    for (const action of getAvailableActions(status)) {
      assert.equal(typeof action.label, 'string');
      assert.notEqual(action.label.trim(), '');
    }
  }
});

test('the cancel action label never implies a Stripe refund', () => {
  const cancelAction = getAvailableActions('received').find((a) => a.status === 'cancelled');
  assert.match(cancelAction.label.toLowerCase(), /cancel/);
  assert.ok(!cancelAction.label.toLowerCase().includes('refund'));
});
