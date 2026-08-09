'use strict';

// End-to-end coverage for the Phase 14A global error-handling middleware
// and malformed-JSON handling. Builds a small real Express app wired with
// the REAL security-headers/error-response lib functions and the exact
// same final error-handling middleware shape server.js registers last —
// only the specific throwing routes are test-only stand-ins for "some
// unexpected bug in a real route," matching the trade-off already
// accepted throughout this project's other route-boundary tests.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { securityHeaders } = require('../lib/security-headers');
const { buildErrorResponse } = require('../lib/error-response');

function buildTestApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(express.json());

  app.get('/boom-sync', () => {
    throw new Error("unexpected failure reading /var/www/app/server/secret-config.json");
  });

  app.get('/boom-async', async () => {
    // Simulates an unexpected Mongo-shaped failure reaching a route with
    // no try/catch of its own — Express 5 forwards this automatically.
    const err = new Error('E11000 duplicate key error collection: prod.orders index: stripeSessionId_1');
    err.code = 11000;
    throw err;
  });

  app.post('/json-route', (req, res) => {
    res.status(200).json({ ok: true, received: req.body });
  });

  // Mirrors server.js's real final error-handling middleware exactly.
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

test('global error handling', async (t) => {
  const app = buildTestApp();
  const { server, baseUrl } = await startTestServer(app);
  t.after(() => stopTestServer(server));

  await t.test('a synchronously-thrown route error produces a generic response, never the real message', async () => {
    const res = await fetch(`${baseUrl}/boom-sync`);
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.deepEqual(body, { error: 'Something went wrong. Please try again later.' });
  });

  await t.test('the response never contains a filesystem path', async () => {
    const res = await fetch(`${baseUrl}/boom-sync`);
    const text = await res.text();
    assert.ok(!text.includes('/var/www'));
    assert.ok(!text.includes('secret-config'));
  });

  await t.test('the response never contains a stack trace', async () => {
    const res = await fetch(`${baseUrl}/boom-sync`);
    const text = await res.text();
    assert.ok(!text.includes('.js:'));
    assert.ok(!/\bat \S+/.test(text)); // stack frames look like "at functionName (...)"
  });

  await t.test('an async-thrown error (Express 5 auto-forwarded) is caught the same way, never leaking a Mongo error detail', async () => {
    const res = await fetch(`${baseUrl}/boom-async`);
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.ok(!text.includes('E11000'));
    assert.ok(!text.includes('stripeSessionId'));
    assert.deepEqual(JSON.parse(text), { error: 'Something went wrong. Please try again later.' });
  });

  await t.test('malformed JSON body returns a clean 400 JSON response, never a 500 or HTML', async () => {
    const res = await fetch(`${baseUrl}/json-route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{this is not valid json',
    });
    assert.equal(res.status, 400);
    assert.match(res.headers.get('content-type') || '', /application\/json/);
    const body = await res.json();
    assert.deepEqual(body, { error: 'Invalid request body.' });
  });

  await t.test('a well-formed JSON request still works normally after this change', async () => {
    const res = await fetch(`${baseUrl}/json-route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { ok: true, received: { hello: 'world' } });
  });

  await t.test('security headers are present even on an error response', async () => {
    const res = await fetch(`${baseUrl}/boom-sync`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.ok(res.headers.get('referrer-policy'));
  });

  await t.test('X-Powered-By is absent even on an error response', async () => {
    const res = await fetch(`${baseUrl}/boom-sync`);
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  await t.test('the safe response does not depend on NODE_ENV — still generic when NODE_ENV is unset/development', async () => {
    const original = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    try {
      const res = await fetch(`${baseUrl}/boom-sync`);
      const body = await res.json();
      assert.deepEqual(body, { error: 'Something went wrong. Please try again later.' });
    } finally {
      if (original === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = original;
    }
  });
});
