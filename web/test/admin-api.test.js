import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loginAdmin,
  logoutAdmin,
  getAdminSessionStatus,
  fetchAdminOrders,
  fetchAdminOrder,
  updateAdminOrder,
  resendAdminOrderConfirmation,
} from '../src/lib/admin-api.js';

// Uses real, Node-native `Response` objects (global as of Node 18+) so
// these tests exercise the real .status/.json() behavior a genuine
// fetch() call would produce — the same reasoning as
// web/test/orders-access-response.test.js's loadMyOrdersList coverage.

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function recordingFetch(response) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (response instanceof Error) throw response;
    return response;
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

// ---- loginAdmin ----

test('loginAdmin: 200 resolves ok:true', async () => {
  const result = await loginAdmin({ username: 'admin', password: 'x' }, recordingFetch(jsonResponse({ ok: true })));
  assert.deepEqual(result, { ok: true });
});

test('loginAdmin: 401 with the real error body resolves ok:false with that message', async () => {
  const result = await loginAdmin(
    { username: 'admin', password: 'wrong' },
    recordingFetch(jsonResponse({ error: 'Invalid username or password.' }, 401)),
  );
  assert.deepEqual(result, { ok: false, error: 'Invalid username or password.' });
});

test('loginAdmin: a network failure resolves ok:false with a generic message, never throws', async () => {
  const result = await loginAdmin({ username: 'admin', password: 'x' }, recordingFetch(new TypeError('Failed to fetch')));
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, 'string');
});

test('loginAdmin: posts to the relative /api/admin/session/login path with credentials included, and never puts the password in the URL', async () => {
  const fetchImpl = recordingFetch(jsonResponse({ ok: true }));
  await loginAdmin({ username: 'admin', password: 'super-secret' }, fetchImpl);

  const call = fetchImpl.calls[0];
  assert.equal(call.url, '/api/admin/session/login');
  assert.ok(!call.url.includes('super-secret'));
  assert.equal(call.options.credentials, 'include');
  assert.equal(call.options.method, 'POST');
  assert.match(call.options.body, /super-secret/); // only in the JSON body, never the URL
});

// ---- logoutAdmin ----

test('logoutAdmin: calls the relative logout endpoint with credentials included', async () => {
  const fetchImpl = recordingFetch(jsonResponse({ ok: true }));
  await logoutAdmin(fetchImpl);
  assert.equal(fetchImpl.calls[0].url, '/api/admin/session/logout');
  assert.equal(fetchImpl.calls[0].options.credentials, 'include');
});

test('logoutAdmin: never throws even when the network call fails', async () => {
  await assert.doesNotReject(() => logoutAdmin(recordingFetch(new TypeError('Failed to fetch'))));
});

// ---- getAdminSessionStatus ----

test('getAdminSessionStatus: reflects authenticated:true from a real 200 response', async () => {
  const result = await getAdminSessionStatus(recordingFetch(jsonResponse({ authenticated: true })));
  assert.deepEqual(result, { authenticated: true });
});

test('getAdminSessionStatus: reflects authenticated:false from a real 200 response', async () => {
  const result = await getAdminSessionStatus(recordingFetch(jsonResponse({ authenticated: false })));
  assert.deepEqual(result, { authenticated: false });
});

test('getAdminSessionStatus: a network failure fails closed as authenticated:false, never throws', async () => {
  const result = await getAdminSessionStatus(recordingFetch(new TypeError('Failed to fetch')));
  assert.deepEqual(result, { authenticated: false });
});

test('getAdminSessionStatus: a malformed/non-boolean body fails closed as authenticated:false', async () => {
  const result = await getAdminSessionStatus(recordingFetch(jsonResponse({ authenticated: 'yes' })));
  assert.deepEqual(result, { authenticated: false });
});

// ---- fetchAdminOrders ----

test('fetchAdminOrders: 200 with a real orders array', async () => {
  const orders = [{ orderNumber: 'CCK-20260808-4F2A' }];
  const result = await fetchAdminOrders(recordingFetch(jsonResponse({ orders })));
  assert.deepEqual(result, { ok: true, orders });
});

test('fetchAdminOrders: 401 (session expired) surfaces status:401 for the caller to redirect to login', async () => {
  const result = await fetchAdminOrders(recordingFetch(jsonResponse({ error: 'Not authenticated.' }, 401)));
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test('fetchAdminOrders: 500 surfaces status:500, distinct from 401', async () => {
  const result = await fetchAdminOrders(recordingFetch(jsonResponse({ error: 'Unable to fetch orders right now.' }, 500)));
  assert.equal(result.ok, false);
  assert.equal(result.status, 500);
});

test('fetchAdminOrders: a network failure surfaces status:0, distinct from any real HTTP status', async () => {
  const result = await fetchAdminOrders(recordingFetch(new TypeError('Failed to fetch')));
  assert.equal(result.ok, false);
  assert.equal(result.status, 0);
});

test('fetchAdminOrders: uses the relative path with credentials included', async () => {
  const fetchImpl = recordingFetch(jsonResponse({ orders: [] }));
  await fetchAdminOrders(fetchImpl);
  assert.equal(fetchImpl.calls[0].url, '/api/admin/orders');
  assert.equal(fetchImpl.calls[0].options.credentials, 'include');
});

// ---- fetchAdminOrder ----

test('fetchAdminOrder: 200 with a real order', async () => {
  const order = { orderNumber: 'CCK-20260808-4F2A' };
  const result = await fetchAdminOrder('CCK-20260808-4F2A', recordingFetch(jsonResponse({ order })));
  assert.deepEqual(result, { ok: true, order });
});

test('fetchAdminOrder: 404 surfaces status:404', async () => {
  const result = await fetchAdminOrder('CCK-NOPE', recordingFetch(jsonResponse({ error: 'Order not found.' }, 404)));
  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
});

test('fetchAdminOrder: URL-encodes the order number into the relative path', async () => {
  const fetchImpl = recordingFetch(jsonResponse({ order: {} }));
  await fetchAdminOrder('CCK 2026/08', fetchImpl);
  assert.equal(fetchImpl.calls[0].url, '/api/admin/orders/CCK%202026%2F08');
});

// ---- updateAdminOrder ----

test('updateAdminOrder: 200 with the updated order', async () => {
  const order = { orderNumber: 'CCK-20260808-4F2A', orderStatus: 'processing' };
  const result = await updateAdminOrder('CCK-20260808-4F2A', { orderStatus: 'processing' }, recordingFetch(jsonResponse({ order })));
  assert.deepEqual(result, { ok: true, order });
});

test('updateAdminOrder: 409 surfaces status:409 distinctly, for stale-order/reload handling', async () => {
  const result = await updateAdminOrder(
    'CCK-20260808-4F2A',
    { orderStatus: 'processing' },
    recordingFetch(jsonResponse({ error: 'This order was modified by another request. Please refresh and try again.' }, 409)),
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.match(result.error, /modified by another request/);
});

test('updateAdminOrder: 400 surfaces the real validation error message', async () => {
  const result = await updateAdminOrder(
    'CCK-20260808-4F2A',
    { orderStatus: 'bogus' },
    recordingFetch(jsonResponse({ error: 'orderStatus must be one of: received, processing, shipped, delivered, cancelled.' }, 400)),
  );
  assert.equal(result.status, 400);
  assert.match(result.error, /orderStatus must be one of/);
});

test('updateAdminOrder: sends the patch body verbatim as JSON, method PATCH, credentials included', async () => {
  const fetchImpl = recordingFetch(jsonResponse({ order: {} }));
  await updateAdminOrder('CCK-20260808-4F2A', { orderStatus: 'shipped', carrier: 'USPS' }, fetchImpl);

  const call = fetchImpl.calls[0];
  assert.equal(call.url, '/api/admin/orders/CCK-20260808-4F2A');
  assert.equal(call.options.method, 'PATCH');
  assert.equal(call.options.credentials, 'include');
  assert.deepEqual(JSON.parse(call.options.body), { orderStatus: 'shipped', carrier: 'USPS' });
});

// ---- resendAdminOrderConfirmation ----

test('resendAdminOrderConfirmation: 200 resolves ok:true', async () => {
  const result = await resendAdminOrderConfirmation('CCK-20260808-4F2A', recordingFetch(jsonResponse({ ok: true })));
  assert.deepEqual(result, { ok: true });
});

test('resendAdminOrderConfirmation: 500 surfaces the failure without altering anything client-side', async () => {
  const result = await resendAdminOrderConfirmation(
    'CCK-20260808-4F2A',
    recordingFetch(jsonResponse({ error: 'Unable to resend the confirmation email right now. Please try again later.' }, 500)),
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 500);
});

test('resendAdminOrderConfirmation: posts to the relative resend-confirmation path, never asking the caller for an email', async () => {
  const fetchImpl = recordingFetch(jsonResponse({ ok: true }));
  await resendAdminOrderConfirmation('CCK-20260808-4F2A', fetchImpl);
  assert.equal(fetchImpl.calls[0].url, '/api/admin/orders/CCK-20260808-4F2A/resend-confirmation');
  assert.equal(fetchImpl.calls[0].options.method, 'POST');
  assert.equal(fetchImpl.calls[0].options.body, undefined);
});
