import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMyOrdersSessionStatus, extractMagicLinkToken, loadMyOrdersList } from '../src/lib/orders-access-response.js';

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
