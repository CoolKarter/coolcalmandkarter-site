import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyMyOrdersSessionStatus,
  extractMagicLinkToken,
  loadMyOrdersList,
  isTransientMyOrdersStatus,
  loadMyOrdersListWithRetry,
} from '../src/lib/orders-access-response.js';

test('200 classifies as authenticated', () => {
  assert.equal(classifyMyOrdersSessionStatus(200), 'authenticated');
});

test('401 classifies as signed-out', () => {
  assert.equal(classifyMyOrdersSessionStatus(401), 'signed-out');
});

test('any other status (500, 404, 0, etc.) classifies as a generic error state, never as signed-out or authenticated', () => {
  assert.equal(classifyMyOrdersSessionStatus(500), 'error');
  assert.equal(classifyMyOrdersSessionStatus(404), 'error');
  assert.equal(classifyMyOrdersSessionStatus(0), 'error');
  assert.equal(classifyMyOrdersSessionStatus(undefined), 'error');
});

test('extractMagicLinkToken reads the token from a fragment string', () => {
  assert.equal(extractMagicLinkToken('#token=abc123'), 'abc123');
});

test('extractMagicLinkToken works with or without the leading #', () => {
  assert.equal(extractMagicLinkToken('token=abc123'), 'abc123');
});

test('extractMagicLinkToken returns null for an empty or missing fragment', () => {
  assert.equal(extractMagicLinkToken(''), null);
  assert.equal(extractMagicLinkToken('#'), null);
  assert.equal(extractMagicLinkToken(undefined), null);
  assert.equal(extractMagicLinkToken(null), null);
});

test('extractMagicLinkToken returns null when there is no token key', () => {
  assert.equal(extractMagicLinkToken('#other=value'), null);
});

test('extractMagicLinkToken trims incidental whitespace', () => {
  assert.equal(extractMagicLinkToken('#token=  abc123  '), 'abc123');
});

test('extractMagicLinkToken handles a real 64-char hex token', () => {
  const token = 'f'.repeat(64);
  assert.equal(extractMagicLinkToken(`#token=${token}`), token);
});

// ---- loadMyOrdersList: the actual GET /api/my-orders request/response
// handling used by web/src/lib/api.ts's fetchMyOrders() (api.ts is
// TypeScript and reads import.meta.env at module scope, so it can't be
// imported directly by plain Node — this is the real logic, not a
// reimplementation of it; api.ts's fetchMyOrders() is now a one-line
// wrapper around this exact function). Uses real, Node-native `Response`
// objects (global as of Node 18+) rather than hand-typed plain objects,
// so this exercises the real `.status`/`.json()` behavior a genuine
// fetch() call would produce — this is the boundary the reported staging
// bug lived at (or would have, had one existed here), not the pure
// classifier alone. ----

function fetchImplResolvingTo(response) {
  return async () => response;
}

test('loadMyOrdersList: a 200 response with a real orders array renders as authenticated', async () => {
  const response = new Response(JSON.stringify({ orders: [{ orderNumber: 'CCK-20260808-4F2A' }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  const result = await loadMyOrdersList(fetchImplResolvingTo(response));
  assert.deepEqual(result, { state: 'authenticated', orders: [{ orderNumber: 'CCK-20260808-4F2A' }] });
});

test('loadMyOrdersList: the exact real staging 401 response — {"error":"Not authenticated."} — renders as signed-out, not error', async () => {
  // This is byte-for-byte the response server.js's GET /api/my-orders
  // route sends for a missing/invalid session — verified directly against
  // the live staging deployment while diagnosing this report.
  const response = new Response(JSON.stringify({ error: 'Not authenticated.' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });

  const result = await loadMyOrdersList(fetchImplResolvingTo(response));
  assert.deepEqual(result, { state: 'signed-out', orders: [] });
});

test('loadMyOrdersList: a 401 with no body at all still renders as signed-out (status alone drives classification, never the body)', async () => {
  const response = new Response(null, { status: 401 });
  const result = await loadMyOrdersList(fetchImplResolvingTo(response));
  assert.deepEqual(result, { state: 'signed-out', orders: [] });
});

test('loadMyOrdersList: a 500 (or any non-200/401 status) renders as a temporary error, never as signed-out', async () => {
  const response = new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  const result = await loadMyOrdersList(fetchImplResolvingTo(response));
  assert.deepEqual(result, { state: 'error', orders: [] });
});

test('loadMyOrdersList: a genuine network failure (fetch rejects) renders as a temporary error, never as signed-out', async () => {
  const throwingFetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  const result = await loadMyOrdersList(throwingFetch);
  assert.deepEqual(result, { state: 'error', orders: [] });
});

test('loadMyOrdersList: a 200 response whose body fails to parse as JSON still renders as authenticated with an empty order list, not error', async () => {
  const response = new Response('not valid json', { status: 200 });
  const result = await loadMyOrdersList(fetchImplResolvingTo(response));
  assert.deepEqual(result, { state: 'authenticated', orders: [] });
});

test('loadMyOrdersList: a 200 response whose body has no orders array still renders as authenticated with an empty order list', async () => {
  const response = new Response(JSON.stringify({ unexpected: 'shape' }), { status: 200 });
  const result = await loadMyOrdersList(fetchImplResolvingTo(response));
  assert.deepEqual(result, { state: 'authenticated', orders: [] });
});

// ---- Phase 14C1: transient-failure classification + bounded automatic
// retry (loadMyOrdersListWithRetry) — the fix for a real staging bug where
// a cold-start/database-not-ready race could leave a customer staring at
// "Loading your orders…" for several seconds before landing on "Something
// Went Wrong", even though a second attempt moments later would have
// resolved normally. See server.js's GET /api/my-orders 503 branch for
// the matching backend half of this fix. ----

test('isTransientMyOrdersStatus treats 502/503/504 as transient', () => {
  assert.equal(isTransientMyOrdersStatus(502), true);
  assert.equal(isTransientMyOrdersStatus(503), true);
  assert.equal(isTransientMyOrdersStatus(504), true);
});

test('isTransientMyOrdersStatus treats 500 as NOT transient — retrying a deterministic backend bug would hide it instead of surfacing it', () => {
  assert.equal(isTransientMyOrdersStatus(500), false);
});

test('isTransientMyOrdersStatus treats 401 and 404 as NOT transient', () => {
  assert.equal(isTransientMyOrdersStatus(401), false);
  assert.equal(isTransientMyOrdersStatus(404), false);
});

function fetchSequence(responses) {
  let call = 0;
  const fetchImpl = async () => {
    const next = responses[Math.min(call, responses.length - 1)];
    call += 1;
    if (next instanceof Error) throw next;
    return next;
  };
  fetchImpl.callCount = () => call;
  return fetchImpl;
}

function noopSleep() {
  const delays = [];
  const sleepImpl = async (ms) => {
    delays.push(ms);
  };
  sleepImpl.delays = delays;
  return sleepImpl;
}

test('loadMyOrdersListWithRetry: a first-attempt 503 followed by a successful 200 resolves as authenticated, using exactly 2 fetch calls', async () => {
  const fetchImpl = fetchSequence([
    new Response(null, { status: 503 }),
    new Response(JSON.stringify({ orders: [{ orderNumber: 'CCK-1' }] }), { status: 200 }),
  ]);
  const sleepImpl = noopSleep();

  const result = await loadMyOrdersListWithRetry(fetchImpl, { sleepImpl });

  assert.deepEqual(result, { state: 'authenticated', orders: [{ orderNumber: 'CCK-1' }] });
  assert.equal(fetchImpl.callCount(), 2);
  assert.equal(sleepImpl.delays.length, 1);
});

test('loadMyOrdersListWithRetry: a first-attempt 503 followed by a second attempt landing on 401 resolves as signed-out, not error — the retry can reveal the real answer', async () => {
  const fetchImpl = fetchSequence([
    new Response(null, { status: 503 }),
    new Response(JSON.stringify({ error: 'Not authenticated.' }), { status: 401 }),
  ]);
  const result = await loadMyOrdersListWithRetry(fetchImpl, { sleepImpl: noopSleep() });

  assert.deepEqual(result, { state: 'signed-out', orders: [] });
  assert.equal(fetchImpl.callCount(), 2);
});

test('loadMyOrdersListWithRetry: two consecutive transient failures reach the error state after exactly one retry — never a loop', async () => {
  const fetchImpl = fetchSequence([new Response(null, { status: 503 }), new Response(null, { status: 503 })]);
  const result = await loadMyOrdersListWithRetry(fetchImpl, { sleepImpl: noopSleep() });

  assert.deepEqual(result, { state: 'error', orders: [] });
  assert.equal(fetchImpl.callCount(), 2, 'expected exactly 2 attempts total (1 initial + 1 retry), never more');
});

test('loadMyOrdersListWithRetry: two consecutive genuine network failures (fetch rejects) also resolve after exactly one retry', async () => {
  const fetchImpl = fetchSequence([new TypeError('Failed to fetch'), new TypeError('Failed to fetch')]);
  const result = await loadMyOrdersListWithRetry(fetchImpl, { sleepImpl: noopSleep() });

  assert.deepEqual(result, { state: 'error', orders: [] });
  assert.equal(fetchImpl.callCount(), 2);
});

test('loadMyOrdersListWithRetry: a normal 401 on the first attempt never triggers a retry — it is the real, final "signed out" answer', async () => {
  const fetchImpl = fetchSequence([new Response(JSON.stringify({ error: 'Not authenticated.' }), { status: 401 })]);
  const sleepImpl = noopSleep();

  const result = await loadMyOrdersListWithRetry(fetchImpl, { sleepImpl });

  assert.deepEqual(result, { state: 'signed-out', orders: [] });
  assert.equal(fetchImpl.callCount(), 1, 'a normal 401 must never be retried');
  assert.equal(sleepImpl.delays.length, 0);
});

test('loadMyOrdersListWithRetry: an ordinary 500 on the first attempt never triggers a retry — retrying a deterministic backend bug would hide it', async () => {
  const fetchImpl = fetchSequence([new Response(null, { status: 500 })]);
  const sleepImpl = noopSleep();

  const result = await loadMyOrdersListWithRetry(fetchImpl, { sleepImpl });

  assert.deepEqual(result, { state: 'error', orders: [] });
  assert.equal(fetchImpl.callCount(), 1);
  assert.equal(sleepImpl.delays.length, 0);
});

test('loadMyOrdersListWithRetry: a successful 200 on the first attempt never triggers a retry', async () => {
  const fetchImpl = fetchSequence([new Response(JSON.stringify({ orders: [] }), { status: 200 })]);
  const sleepImpl = noopSleep();

  const result = await loadMyOrdersListWithRetry(fetchImpl, { sleepImpl });

  assert.deepEqual(result, { state: 'authenticated', orders: [] });
  assert.equal(fetchImpl.callCount(), 1);
  assert.equal(sleepImpl.delays.length, 0);
});

test('loadMyOrdersListWithRetry: each attempt is fully awaited before the next starts — no overlapping/concurrent requests', async () => {
  let inFlight = 0;
  let maxConcurrent = 0;
  const fetchImpl = async () => {
    inFlight += 1;
    maxConcurrent = Math.max(maxConcurrent, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    return new Response(null, { status: 503 });
  };

  await loadMyOrdersListWithRetry(fetchImpl, { sleepImpl: noopSleep() });

  assert.equal(maxConcurrent, 1, 'expected at most one in-flight fetch at any time');
});

test('loadMyOrdersListWithRetry: uses a short, reasonable default retry delay when no override is supplied', async () => {
  const fetchImpl = fetchSequence([new Response(null, { status: 503 }), new Response(JSON.stringify({ orders: [] }), { status: 200 })]);
  const sleepImpl = noopSleep();

  await loadMyOrdersListWithRetry(fetchImpl, { sleepImpl });

  assert.equal(sleepImpl.delays.length, 1);
  assert.ok(sleepImpl.delays[0] > 0 && sleepImpl.delays[0] <= 2000, `expected a short, reasonable retry delay, got ${sleepImpl.delays[0]}ms`);
});

test('loadMyOrdersList (single-attempt, unchanged) never retries even on a transient status — retry is opt-in via loadMyOrdersListWithRetry only', async () => {
  const fetchImpl = fetchSequence([new Response(null, { status: 503 })]);
  const result = await loadMyOrdersList(fetchImpl);

  assert.deepEqual(result, { state: 'error', orders: [] });
  assert.equal(fetchImpl.callCount(), 1);
});
