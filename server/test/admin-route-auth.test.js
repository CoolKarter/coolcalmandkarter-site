'use strict';

// Regression coverage for a real staging bug: a broad
// app.use('/api/orders', basicAuth(...)) prefix mount in server.js
// intercepted the public customer routes POST /api/orders/access/request,
// /verify, and /logout (all nested under the /api/orders path segment)
// before they ever reached their own handlers, so customers saw a native
// browser Basic Auth popup instead of the Phase 13C magic-link flow.
//
// server.js can't be required directly in a test process — doing so
// connects to MongoDB and calls app.listen(). Rather than rewrite its
// architecture just to test this, this file builds a minimal Express app
// using the REAL `express` and `express-basic-auth` packages (the same
// ones server.js uses), wired with the exact same route/middleware call
// shapes server.js now uses at the admin-auth boundary:
//   - adminAuth applied directly as route-level middleware to
//     GET /api/orders and GET /api/orders/export only
//   - every other route registered with no admin middleware at all
// This exercises the real Express path-matching/middleware-shadowing
// mechanism that caused the bug, not a hand-rolled reimplementation of it.
// If server.js's admin-auth wiring at the routes below (see server.js's
// "Admin auth" section and the two app.get('/api/orders'... /
// '/api/orders/export'...) declarations) ever regresses back to a broad
// prefix mount, the equivalent test app here would reproduce the same
// failure — keep this file's route shapes in sync with server.js's.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const basicAuth = require('express-basic-auth');

const ADMIN_USER = 'admin';
const ADMIN_PASSWORD = 'test-admin-password';

function buildTestApp() {
  const app = express();
  app.use(express.json());

  const adminAuth = basicAuth({
    users: { [ADMIN_USER]: ADMIN_PASSWORD },
    challenge: true,
  });

  // Public customer routes (Phase 13C magic-link flow) — no admin auth.
  app.post('/api/orders/access/request', (req, res) => {
    res.status(200).json({ ok: true, route: 'access-request' });
  });
  app.post('/api/orders/access/verify', (req, res) => {
    res.status(200).json({ ok: true, route: 'access-verify' });
  });
  app.post('/api/orders/access/logout', (req, res) => {
    res.status(200).json({ ok: true, route: 'access-logout' });
  });

  // Public shape, but authorization comes from CustomerSession — an
  // unauthenticated request gets a plain 401 JSON body, never a Basic Auth
  // challenge (no WWW-Authenticate header).
  app.get('/api/my-orders', (req, res) => {
    res.status(401).json({ error: 'Not authenticated.' });
  });

  // Legacy admin routes — adminAuth applied directly at the route, exactly
  // as server.js does after the fix.
  app.get('/api/orders', adminAuth, (req, res) => {
    res.status(200).json({ orders: [] });
  });
  app.get('/api/orders/export', adminAuth, (req, res) => {
    res.status(200).json({ exported: true });
  });

  return app;
}

function startTestServer(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function stopTestServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('admin route auth boundary', async (t) => {
  const app = buildTestApp();
  const { server, baseUrl } = await startTestServer(app);
  t.after(() => stopTestServer(server));

  await t.test('A. POST /api/orders/access/request never triggers legacy Basic Auth', async () => {
    const res = await fetch(`${baseUrl}/api/orders/access/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'customer@example.com' }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('www-authenticate'), null);
    const body = await res.json();
    assert.deepEqual(body, { ok: true, route: 'access-request' });
  });

  await t.test('B. POST /api/orders/access/verify never triggers legacy Basic Auth', async () => {
    const res = await fetch(`${baseUrl}/api/orders/access/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'abc123' }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('www-authenticate'), null);
  });

  await t.test('C. POST /api/orders/access/logout never triggers legacy Basic Auth', async () => {
    const res = await fetch(`${baseUrl}/api/orders/access/logout`, { method: 'POST' });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('www-authenticate'), null);
  });

  await t.test('D. GET /api/my-orders never triggers legacy Basic Auth — unauthenticated response comes from CustomerSession, not express-basic-auth', async () => {
    const res = await fetch(`${baseUrl}/api/my-orders`);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('www-authenticate'), null);
    const body = await res.json();
    assert.deepEqual(body, { error: 'Not authenticated.' });
  });

  await t.test('E. GET /api/orders still requires legacy admin Basic Auth', async () => {
    const res = await fetch(`${baseUrl}/api/orders`);
    assert.equal(res.status, 401);
    assert.match(res.headers.get('www-authenticate') || '', /^Basic/);
  });

  await t.test('E2. GET /api/orders succeeds with correct admin credentials', async () => {
    const auth = Buffer.from(`${ADMIN_USER}:${ADMIN_PASSWORD}`).toString('base64');
    const res = await fetch(`${baseUrl}/api/orders`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    assert.equal(res.status, 200);
  });

  await t.test('F. GET /api/orders/export still requires legacy admin Basic Auth', async () => {
    const res = await fetch(`${baseUrl}/api/orders/export`);
    assert.equal(res.status, 401);
    assert.match(res.headers.get('www-authenticate') || '', /^Basic/);
  });

  await t.test('F2. GET /api/orders/export succeeds with correct admin credentials', async () => {
    const auth = Buffer.from(`${ADMIN_USER}:${ADMIN_PASSWORD}`).toString('base64');
    const res = await fetch(`${baseUrl}/api/orders/export`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    assert.equal(res.status, 200);
  });

  await t.test('G. no customer-facing route ever emits a WWW-Authenticate header', async () => {
    const customerRequests = [
      fetch(`${baseUrl}/api/orders/access/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      fetch(`${baseUrl}/api/orders/access/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      fetch(`${baseUrl}/api/orders/access/logout`, { method: 'POST' }),
      fetch(`${baseUrl}/api/my-orders`),
    ];
    const responses = await Promise.all(customerRequests);
    for (const res of responses) {
      assert.equal(res.headers.get('www-authenticate'), null);
    }
  });
});
