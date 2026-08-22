'use strict';

// Regression coverage for the global out-of-stock checkout kill-switch
// (STORE_CHECKOUT_ENABLED — see lib/store-checkout-status.js and
// server.js's guard on POST /api/checkout/session and the legacy
// POST /create-checkout-session). server.js can't be required directly
// in a test process (it connects to MongoDB and calls startServer() at
// module load — see test/admin-route-auth.test.js and
// test/my-orders-session-resilience.test.js for the same established
// workaround this file follows): a minimal Express app mirrors the exact
// guard shape server.js now uses on both routes — the switch check runs
// first, before any request validation or Stripe call, using an
// injectable `createSession` stand-in so this file makes NO real Stripe
// calls at all.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { isStoreCheckoutEnabled } = require('../lib/store-checkout-status');

const ALL_12_SLUGS = [
  'beach-and-baby', 'black-proud-and-baby', 'black-puerto-rican-and-baby',
  'adventure-fun-and-baby', 'go-to-sleep-karter', 'abuelita-and-baby',
  'black-white-and-baby', 'christmas-and-baby', 'halloween-and-baby',
  'mexican-and-baby', 'puertorican-boricua-and-baby', 'thanksgiving-and-baby',
];

/** Mirrors the exact guard shape now used on both real checkout routes. */
function buildTestApp({ storeCheckoutEnabledRaw, createSession }) {
  const app = express();
  app.use(express.json());
  const STORE_CHECKOUT_ENABLED = isStoreCheckoutEnabled(storeCheckoutEnabledRaw);

  app.post('/api/checkout/session', async (req, res) => {
    if (!STORE_CHECKOUT_ENABLED) {
      return res.status(503).json({ error: 'Books are currently out of stock. More copies are coming soon.' });
    }
    const result = await createSession(req.body);
    res.json(result);
  });

  app.post('/create-checkout-session', async (req, res) => {
    if (!STORE_CHECKOUT_ENABLED) {
      return res.status(503).json({ error: 'Books are currently out of stock. More copies are coming soon.' });
    }
    const result = await createSession(req.body);
    res.json(result);
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

function fakeCreateSession() {
  let callCount = 0;
  const fn = async () => {
    callCount += 1;
    return { url: 'https://checkout.stripe.com/c/pay/cs_test_fake' };
  };
  fn.callCount = () => callCount;
  return fn;
}

test('STORE_CHECKOUT_ENABLED=false: a valid-shaped request is rejected with 503, and Stripe session creation is never called', async (t) => {
  const createSession = fakeCreateSession();
  const app = buildTestApp({ storeCheckoutEnabledRaw: 'false', createSession });
  const { server, baseUrl } = await startTestServer(app);
  t.after(() => stopTestServer(server));

  const res = await fetch(`${baseUrl}/api/checkout/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ slug: 'beach-and-baby', quantity: 1 }] }),
  });
  const body = await res.json();

  assert.equal(res.status, 503);
  assert.deepEqual(body, { error: 'Books are currently out of stock. More copies are coming soon.' });
  assert.equal(createSession.callCount(), 0);
});

test('STORE_CHECKOUT_ENABLED=false: a request using an OLD (pre-rename) slug still gets the exact same immediate 503 — the switch is checked before any slug/catalog resolution', async (t) => {
  const createSession = fakeCreateSession();
  const app = buildTestApp({ storeCheckoutEnabledRaw: 'false', createSession });
  const { server, baseUrl } = await startTestServer(app);
  t.after(() => stopTestServer(server));

  for (const oldSlug of ['florida-beach-and-baby', 'black-beautiful-and-baby']) {
    const res = await fetch(`${baseUrl}/api/checkout/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ slug: oldSlug, quantity: 1 }] }),
    });
    const body = await res.json();

    assert.equal(res.status, 503, `expected old slug "${oldSlug}" to still be rejected with 503`);
    assert.deepEqual(body, { error: 'Books are currently out of stock. More copies are coming soon.' });
  }
  assert.equal(createSession.callCount(), 0);
});

test('STORE_CHECKOUT_ENABLED=false: a stale/garbage request body is also rejected before ever reaching validation', async (t) => {
  const createSession = fakeCreateSession();
  const app = buildTestApp({ storeCheckoutEnabledRaw: 'false', createSession });
  const { server, baseUrl } = await startTestServer(app);
  t.after(() => stopTestServer(server));

  const res = await fetch(`${baseUrl}/api/checkout/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nonsense: true }),
  });

  assert.equal(res.status, 503);
  assert.equal(createSession.callCount(), 0);
});

test('STORE_CHECKOUT_ENABLED=false: every one of the 12 real book slugs is protected — none can slip through', async (t) => {
  const createSession = fakeCreateSession();
  const app = buildTestApp({ storeCheckoutEnabledRaw: 'false', createSession });
  const { server, baseUrl } = await startTestServer(app);
  t.after(() => stopTestServer(server));

  for (const slug of ALL_12_SLUGS) {
    const res = await fetch(`${baseUrl}/api/checkout/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ slug, quantity: 1 }] }),
    });
    assert.equal(res.status, 503, `expected ${slug} to be rejected`);
  }
  assert.equal(createSession.callCount(), 0);
});

test('STORE_CHECKOUT_ENABLED=false: the legacy /create-checkout-session route is protected too — a direct request there cannot bypass the switch', async (t) => {
  const createSession = fakeCreateSession();
  const app = buildTestApp({ storeCheckoutEnabledRaw: 'false', createSession });
  const { server, baseUrl } = await startTestServer(app);
  t.after(() => stopTestServer(server));

  const res = await fetch(`${baseUrl}/create-checkout-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ price: 'price_x', quantity: 1 }], customerEmail: 'buyer@example.com' }),
  });

  assert.equal(res.status, 503);
  assert.equal(createSession.callCount(), 0);
});

test('STORE_CHECKOUT_ENABLED missing: fails closed, same as explicitly false', async (t) => {
  const createSession = fakeCreateSession();
  const app = buildTestApp({ storeCheckoutEnabledRaw: undefined, createSession });
  const { server, baseUrl } = await startTestServer(app);
  t.after(() => stopTestServer(server));

  const res = await fetch(`${baseUrl}/api/checkout/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ slug: 'beach-and-baby', quantity: 1 }] }),
  });

  assert.equal(res.status, 503);
  assert.equal(createSession.callCount(), 0);
});

test('STORE_CHECKOUT_ENABLED invalid (e.g. "TRUE", "1"): fails closed', async (t) => {
  for (const invalidValue of ['TRUE', '1', 'yes', 'enabled']) {
    const createSession = fakeCreateSession();
    const app = buildTestApp({ storeCheckoutEnabledRaw: invalidValue, createSession });
    const { server, baseUrl } = await startTestServer(app);

    const res = await fetch(`${baseUrl}/api/checkout/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ slug: 'beach-and-baby', quantity: 1 }] }),
    });

    assert.equal(res.status, 503, `expected "${invalidValue}" to fail closed`);
    assert.equal(createSession.callCount(), 0);
    await stopTestServer(server);
  }
});

test('STORE_CHECKOUT_ENABLED=true: the existing checkout flow proceeds normally and reaches session creation', async (t) => {
  const createSession = fakeCreateSession();
  const app = buildTestApp({ storeCheckoutEnabledRaw: 'true', createSession });
  const { server, baseUrl } = await startTestServer(app);
  t.after(() => stopTestServer(server));

  const res = await fetch(`${baseUrl}/api/checkout/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ slug: 'beach-and-baby', quantity: 1 }] }),
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(createSession.callCount(), 1);
  assert.match(body.url, /^https:\/\/checkout\.stripe\.com\//);
});
