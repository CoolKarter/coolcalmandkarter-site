'use strict';

// Phase 14C1 — regression coverage for a real staging bug: GET
// /api/my-orders resolved the customer session (originally a bare call to
// getAuthenticatedCustomerEmail(req)) with NO try/catch of its own — only
// the later Order.find() step had one. On a cold start, a request could
// arrive before Mongoose's connection to MongoDB finished establishing;
// the session lookup would then sit in Mongoose's internal query buffer
// for its default ~10s timeout before rejecting. That rejection had
// nowhere to go but Express 5's automatic promise-rejection forwarding to
// the final, generic error-handling middleware — see
// server/lib/error-response.js, which collapses EVERY non-JSON-parse
// error (a real application bug, a Mongo hiccup, anything) into the same
// generic 500. The frontend had no way to tell "the database wasn't ready
// yet, try again shortly" apart from "something is actually broken", and
// (before Phase 14C1) had no retry logic at all — so a customer saw
// "Loading your orders…" for several seconds, then "Something Went
// Wrong", even on an ordinary cold-start race that had nothing to do with
// their own signed-in/signed-out status.
//
// server.js can't be required directly in a test process — it connects to
// MongoDB and calls app.listen() at module load (see
// test/admin-route-auth.test.js for the same constraint and the same
// established workaround this file follows). Both test apps below use the
// real `express` package and the real lib/error-response.js classifier;
// buildLegacyTestApp() reproduces the EXACT pre-fix route shape (proving
// the bug existed), and buildFixedTestApp() reproduces the EXACT current
// server.js shape (proving the fix works) — both call an injectable
// `resolveEmail(req)` standing in for
// resolveAuthenticatedCustomerEmailOrThrow()/getAuthenticatedCustomerEmail(),
// so a "database not ready" condition is simulated the same way a real
// Mongoose buffering-timeout rejection would behave: resolveEmail() itself
// throws.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { buildErrorResponse } = require('../lib/error-response');

/** The ORIGINAL (pre-Phase-14C1) route shape — session resolution has no try/catch of its own. */
function buildLegacyTestApp({ resolveEmail, fetchOrders }) {
  const app = express();

  app.get('/api/my-orders', async (req, res) => {
    const emailNormalized = await resolveEmail(req);
    if (!emailNormalized) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }
    try {
      const orders = await fetchOrders(emailNormalized);
      res.status(200).json({ orders });
    } catch (err) {
      res.status(500).json({ error: 'Unable to fetch your orders right now.' });
    }
  });

  // Same final error-handling middleware server.js registers last.
  app.use((err, req, res, next) => {
    const { status, body } = buildErrorResponse(err);
    res.status(status).json(body);
  });

  return app;
}

/** The CURRENT (post-Phase-14C1) route shape — session resolution gets its own try/catch, responding 503. */
function buildFixedTestApp({ resolveEmail, fetchOrders }) {
  const app = express();

  app.get('/api/my-orders', async (req, res) => {
    let emailNormalized;
    try {
      emailNormalized = await resolveEmail(req);
    } catch (err) {
      return res.status(503).json({ error: 'Unable to verify your account right now. Please try again in a moment.' });
    }

    if (!emailNormalized) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }

    try {
      const orders = await fetchOrders(emailNormalized);
      res.status(200).json({ orders });
    } catch (err) {
      res.status(500).json({ error: 'Unable to fetch your orders right now.' });
    }
  });

  app.use((err, req, res, next) => {
    const { status, body } = buildErrorResponse(err);
    res.status(status).json(body);
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

const DB_UNAVAILABLE_ERROR = () => Promise.reject(new Error('Database connection not ready.'));

test('REGRESSION: the pre-fix route shape turns a database-unavailable session check into the same generic 500 a real application bug would produce', async (t) => {
  const app = buildLegacyTestApp({ resolveEmail: DB_UNAVAILABLE_ERROR, fetchOrders: async () => [] });
  const { server, baseUrl } = await startTestServer(app);
  t.after(() => stopTestServer(server));

  const res = await fetch(`${baseUrl}/api/my-orders`);
  const body = await res.json();

  assert.equal(res.status, 500);
  assert.deepEqual(body, { error: 'Something went wrong. Please try again later.' });
});

test('FIXED: the current route shape returns a distinct 503, never the generic 500, when the session itself could not be checked', async (t) => {
  const app = buildFixedTestApp({ resolveEmail: DB_UNAVAILABLE_ERROR, fetchOrders: async () => [] });
  const { server, baseUrl } = await startTestServer(app);
  t.after(() => stopTestServer(server));

  const res = await fetch(`${baseUrl}/api/my-orders`);
  const body = await res.json();

  assert.equal(res.status, 503);
  assert.deepEqual(body, { error: 'Unable to verify your account right now. Please try again in a moment.' });
});

test('a database-unavailable session check is never misreported as signed-out (401)', async (t) => {
  const app = buildFixedTestApp({ resolveEmail: DB_UNAVAILABLE_ERROR, fetchOrders: async () => [] });
  const { server, baseUrl } = await startTestServer(app);
  t.after(() => stopTestServer(server));

  const res = await fetch(`${baseUrl}/api/my-orders`);
  assert.notEqual(res.status, 401);
});

test('the 503 response body never leaks the underlying error message, class name, or a stack trace', async (t) => {
  const app = buildFixedTestApp({
    resolveEmail: () => Promise.reject(new Error('MongoServerSelectionError: connect ETIMEDOUT 10.0.0.1:27017')),
    fetchOrders: async () => [],
  });
  const { server, baseUrl } = await startTestServer(app);
  t.after(() => stopTestServer(server));

  const res = await fetch(`${baseUrl}/api/my-orders`);
  const text = await res.text();

  assert.doesNotMatch(text, /Mongo/i);
  assert.doesNotMatch(text, /ETIMEDOUT/);
  assert.doesNotMatch(text, /at Object/); // stack-trace-shaped content
  assert.doesNotMatch(text, /\.js:\d+:\d+/); // file:line:column, stack-trace-shaped
});

test('a normal missing/invalid/expired session (resolver resolves to null, no exception) still returns a clean 401', async (t) => {
  const app = buildFixedTestApp({ resolveEmail: async () => null, fetchOrders: async () => [] });
  const { server, baseUrl } = await startTestServer(app);
  t.after(() => stopTestServer(server));

  const res = await fetch(`${baseUrl}/api/my-orders`);
  const body = await res.json();

  assert.equal(res.status, 401);
  assert.deepEqual(body, { error: 'Not authenticated.' });
});

test('a successfully authenticated request still returns 200 with the real orders', async (t) => {
  const fakeOrders = [{ orderNumber: 'CCK-20260808-4F2A' }];
  const app = buildFixedTestApp({
    resolveEmail: async () => 'buyer@example.com',
    fetchOrders: async (email) => {
      assert.equal(email, 'buyer@example.com');
      return fakeOrders;
    },
  });
  const { server, baseUrl } = await startTestServer(app);
  t.after(() => stopTestServer(server));

  const res = await fetch(`${baseUrl}/api/my-orders`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(body, { orders: fakeOrders });
});

test('a genuine failure fetching orders AFTER successful auth still returns the ordinary 500 — the 503 branch above is only for session-resolution failures', async (t) => {
  const app = buildFixedTestApp({
    resolveEmail: async () => 'buyer@example.com',
    fetchOrders: async () => {
      throw new Error('Unexpected Order.find() failure');
    },
  });
  const { server, baseUrl } = await startTestServer(app);
  t.after(() => stopTestServer(server));

  const res = await fetch(`${baseUrl}/api/my-orders`);
  const body = await res.json();

  assert.equal(res.status, 500);
  assert.deepEqual(body, { error: 'Unable to fetch your orders right now.' });
});
