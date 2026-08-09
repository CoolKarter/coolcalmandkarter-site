'use strict';

// End-to-end coverage for the Phase 13E admin order-management API:
//   GET   /api/admin/orders
//   GET   /api/admin/orders/:orderNumber
//   PATCH /api/admin/orders/:orderNumber
//   POST  /api/admin/orders/:orderNumber/resend-confirmation
//
// As of Phase 13F these routes are gated by the new AdminSession cookie
// (requireAdminSession in server.js), not the legacy Basic Auth they
// launched with in Phase 13E — this file's test app has been updated to
// match, using the REAL admin-session lib functions
// (createAdminSession/authenticateAdminSession, the admin cookie helpers)
// so the auth boundary itself isn't a reimplementation either. The legacy
// GET /api/orders/GET /api/orders/export Basic-Auth boundary is covered
// separately in admin-route-auth.test.js and remains untouched; the new
// admin-session login/logout/status routes themselves are covered in
// admin-session-routes.test.js. This file focuses on the order-management
// business logic — list/detail/PATCH/resend — reusing the REAL
// decision-making functions server.js itself uses: buildAdminOrderPatch,
// buildOrderStatusMatchCondition, toAdminOrderView,
// buildOrderConfirmationEmail, buildShippingConfirmationEmail — against a
// fake in-memory Order model and an injectable fake sendEmail.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const cookieParser = require('cookie-parser');
const { buildAdminOrderPatch, buildOrderStatusMatchCondition } = require('../lib/admin-order-update');
const { toAdminOrderView } = require('../lib/order-views');
const { buildOrderConfirmationEmail, buildShippingConfirmationEmail } = require('../lib/email-templates');
const { createAdminSession, authenticateAdminSession } = require('../lib/admin-session');
const { setAdminSessionCookie, readAdminSessionCookie, INSECURE_COOKIE_NAME } = require('../lib/admin-session-cookie');
const { createFakeAdminOrderModel } = require('./helpers/fake-admin-order-model');
const { createFakeCustomerSessionModel } = require('./helpers/fake-token-model');

const FRONTEND_BASE_URL = 'https://staging.example.com';

function buildTestApp({ orders = [], sendEmailImpl } = {}) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  const Order = createFakeAdminOrderModel({ orders });
  const AdminSession = createFakeCustomerSessionModel();
  const sentEmails = [];
  const sendEmail =
    sendEmailImpl ||
    (async (payload) => {
      sentEmails.push(payload);
      return { ok: true, id: 'email_test_1' };
    });

  async function requireAdminSession(req, res, next) {
    const rawToken = readAdminSessionCookie(req);
    const result = await authenticateAdminSession({ rawToken, AdminSessionModel: AdminSession });
    if (!result.ok) return res.status(401).json({ error: 'Not authenticated.' });
    next();
  }

  app.post('/api/admin/session/login', async (req, res) => {
    // Minimal stand-in — real credential validation is covered in
    // admin-session-routes.test.js. Any request here just establishes a
    // session, so tests can log in without repeating that logic.
    const { rawToken } = await createAdminSession({ AdminSessionModel: AdminSession });
    setAdminSessionCookie(req, res, rawToken);
    res.status(200).json({ ok: true });
  });

  app.get('/api/admin/orders', requireAdminSession, async (req, res) => {
    const list = await Order.find().sort({ date: -1 });
    res.status(200).json({ orders: list.map(toAdminOrderView) });
  });

  app.get('/api/admin/orders/:orderNumber', requireAdminSession, async (req, res) => {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    res.status(200).json({ order: toAdminOrderView(order) });
  });

  app.patch('/api/admin/orders/:orderNumber', requireAdminSession, async (req, res) => {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const result = buildAdminOrderPatch(order, req.body);
    if (!result.ok) return res.status(result.status).json({ error: result.error });

    const updated = await Order.findOneAndUpdate(
      { orderNumber: req.params.orderNumber, ...buildOrderStatusMatchCondition(order.orderStatus) },
      { $set: result.patch },
      { new: true },
    );
    if (!updated) {
      return res.status(409).json({ error: 'This order was modified by another request. Please refresh and try again.' });
    }

    if (result.enteredShipped) {
      sendEmail({
        to: updated.email,
        ...buildShippingConfirmationEmail(updated, { frontendBaseUrl: FRONTEND_BASE_URL }),
      }).catch(() => {});
    }

    res.status(200).json({ order: toAdminOrderView(updated) });
  });

  app.post('/api/admin/orders/:orderNumber/resend-confirmation', requireAdminSession, async (req, res) => {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (!order.email) return res.status(400).json({ error: 'This order has no email on file.' });

    const result = await sendEmail({
      to: order.email,
      ...buildOrderConfirmationEmail(order, { frontendBaseUrl: FRONTEND_BASE_URL }),
    });
    if (!result.ok) {
      return res.status(500).json({ error: 'Unable to resend the confirmation email right now. Please try again later.' });
    }
    res.status(200).json({ ok: true });
  });

  // A stand-in for the real Phase 13C customer route, just enough to prove
  // a customer-session cookie must never grant admin access, and (the
  // converse) that it legitimately grants access to its OWN route —
  // proving the two auth systems are genuinely independent, not that
  // customer auth "happens to fail" for an unrelated reason.
  app.get('/api/my-orders', (req, res) => {
    if (req.headers.cookie === 'cck_session=customer-session-token') {
      return res.status(200).json({ orders: [] });
    }
    res.status(401).json({ error: 'Not authenticated.' });
  });

  return { app, Order, AdminSession, sentEmails };
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

/** Issues a valid admin session directly against the fake AdminSession store and returns a ready-to-use Cookie header value — bypasses the login HTTP round-trip since login itself is covered in admin-session-routes.test.js. */
async function issueAdminCookie(AdminSession) {
  const { rawToken } = await createAdminSession({ AdminSessionModel: AdminSession });
  return `${INSECURE_COOKIE_NAME}=${rawToken}`;
}

function buildOrder(overrides = {}) {
  return {
    orderNumber: 'CCK-20260808-4F2A',
    name: 'Jamie Buyer',
    email: 'buyer@example.com',
    amount: 2997,
    stripeSessionId: 'cs_test_abc123',
    items: [{ title: 'Florida, Beach & Baby', slug: 'florida-beach-and-baby', quantity: 3, unitPrice: 999, lineTotal: 2997 }],
    address: { line1: '1 Main St', city: 'Tampa', state: 'FL', postal_code: '33602', country: 'US' },
    shippingMethod: 'Standard Shipping',
    date: new Date('2026-08-08T12:00:00Z'),
    orderStatus: 'received',
    ...overrides,
  };
}

// ---- Admin session auth boundary ----

test('admin order API auth boundary', async (t) => {
  const { app, AdminSession } = buildTestApp({ orders: [buildOrder()] });
  const { server, baseUrl } = await startTestServer(app);
  t.after(() => stopTestServer(server));

  await t.test('GET /api/admin/orders rejects a request with no session — plain JSON 401, no WWW-Authenticate', async () => {
    const res = await fetch(`${baseUrl}/api/admin/orders`);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('www-authenticate'), null);
  });

  await t.test('GET /api/admin/orders accepts a valid admin session cookie', async () => {
    const cookie = await issueAdminCookie(AdminSession);
    const res = await fetch(`${baseUrl}/api/admin/orders`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
  });

  await t.test('every admin order route requires a valid admin session, none send WWW-Authenticate', async () => {
    const responses = await Promise.all([
      fetch(`${baseUrl}/api/admin/orders/CCK-20260808-4F2A`),
      fetch(`${baseUrl}/api/admin/orders/CCK-20260808-4F2A`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderStatus: 'processing' }),
      }),
      fetch(`${baseUrl}/api/admin/orders/CCK-20260808-4F2A/resend-confirmation`, { method: 'POST' }),
    ]);
    for (const res of responses) {
      assert.equal(res.status, 401);
      assert.equal(res.headers.get('www-authenticate'), null);
    }
  });

  await t.test('a customer-session cookie does not grant admin access', async () => {
    const res = await fetch(`${baseUrl}/api/admin/orders`, { headers: { Cookie: 'cck_session=customer-session-token' } });
    assert.equal(res.status, 401);
  });

  await t.test('the same cookie legitimately authenticates the real customer route — proving the two auth systems are genuinely independent, not both broken', async () => {
    const res = await fetch(`${baseUrl}/api/my-orders`, { headers: { Cookie: 'cck_session=customer-session-token' } });
    assert.equal(res.status, 200);
  });

  await t.test('a legacy-style Basic Auth header does not grant admin access', async () => {
    const basic = `Basic ${Buffer.from('admin:whatever').toString('base64')}`;
    const res = await fetch(`${baseUrl}/api/admin/orders`, { headers: { Authorization: basic } });
    assert.equal(res.status, 401);
  });

  await t.test('an expired admin session cannot access', async () => {
    const cookie = await issueAdminCookie(AdminSession);
    const doc = AdminSession.__store[AdminSession.__store.length - 1];
    doc.expiresAt = new Date(Date.now() - 1000);

    const res = await fetch(`${baseUrl}/api/admin/orders`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 401);
  });
});

// ---- List / detail ----

test('admin order list and detail', async (t) => {
  const older = buildOrder({ orderNumber: 'CCK-20260101-AAAA', date: new Date('2026-01-01T00:00:00Z') });
  const newer = buildOrder({ orderNumber: 'CCK-20260808-4F2A', date: new Date('2026-08-08T12:00:00Z') });
  const legacy = { name: 'Legacy Customer', email: 'legacy@example.com', amount: 500, address: {}, date: new Date('2020-01-01T00:00:00Z') };

  const { app, AdminSession } = buildTestApp({ orders: [older, newer, legacy] });
  const { server, baseUrl } = await startTestServer(app);
  t.after(() => stopTestServer(server));
  const cookie = await issueAdminCookie(AdminSession);

  await t.test('list returns newest orders first', async () => {
    const res = await fetch(`${baseUrl}/api/admin/orders`, { headers: { Cookie: cookie } });
    const body = await res.json();
    assert.equal(body.orders[0].orderNumber, 'CCK-20260808-4F2A');
    assert.equal(body.orders[1].orderNumber, 'CCK-20260101-AAAA');
  });

  await t.test('list does not crash on a legacy order with no orderNumber/status/tracking', async () => {
    const res = await fetch(`${baseUrl}/api/admin/orders`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
    const body = await res.json();
    const legacyView = body.orders.find((o) => o.email === 'legacy@example.com');
    assert.ok(legacyView);
    assert.equal(legacyView.orderNumber, null);
    assert.equal(legacyView.orderStatus, 'received');
  });

  await t.test('list uses the admin view — includes Stripe Session ID and customer identity', async () => {
    const res = await fetch(`${baseUrl}/api/admin/orders`, { headers: { Cookie: cookie } });
    const body = await res.json();
    const view = body.orders.find((o) => o.orderNumber === 'CCK-20260808-4F2A');
    assert.equal(view.stripeSessionId, 'cs_test_abc123');
    assert.equal(view.name, 'Jamie Buyer');
    assert.equal(view.email, 'buyer@example.com');
  });

  await t.test('list never leaks server secrets', async () => {
    const res = await fetch(`${baseUrl}/api/admin/orders`, { headers: { Cookie: cookie } });
    const lower = (await res.text()).toLowerCase();
    assert.ok(!lower.includes('stripe_secret_key'));
    assert.ok(!lower.includes('mongo_uri'));
    assert.ok(!lower.includes('resend_api_key'));
  });

  await t.test('detail returns 404 for an order number that does not exist', async () => {
    const res = await fetch(`${baseUrl}/api/admin/orders/CCK-NOPE-0000`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 404);
  });

  await t.test('detail returns the full admin view for a real order', async () => {
    const res = await fetch(`${baseUrl}/api/admin/orders/CCK-20260808-4F2A`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.order.stripeSessionId, 'cs_test_abc123');
  });
});

// ---- PATCH status update ----

test('admin order PATCH status update', async (t) => {
  await t.test('a valid transition updates status and returns the admin view', async () => {
    const { app, AdminSession } = buildTestApp({ orders: [buildOrder({ orderStatus: 'received' })] });
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));
    const cookie = await issueAdminCookie(AdminSession);

    const res = await fetch(`${baseUrl}/api/admin/orders/CCK-20260808-4F2A`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ orderStatus: 'processing' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.order.orderStatus, 'processing');
  });

  await t.test('an invalid backwards transition is rejected with 400', async () => {
    const { app, AdminSession } = buildTestApp({ orders: [buildOrder({ orderStatus: 'delivered' })] });
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));
    const cookie = await issueAdminCookie(AdminSession);

    const res = await fetch(`${baseUrl}/api/admin/orders/CCK-20260808-4F2A`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ orderStatus: 'processing' }),
    });
    assert.equal(res.status, 400);
  });

  await t.test('PATCH on a nonexistent order returns 404', async () => {
    const { app, AdminSession } = buildTestApp({ orders: [] });
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));
    const cookie = await issueAdminCookie(AdminSession);

    const res = await fetch(`${baseUrl}/api/admin/orders/CCK-NOPE-0000`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ orderStatus: 'processing' }),
    });
    assert.equal(res.status, 404);
  });

  await t.test('transitioning into shipped sets a server-controlled shippedAt — a client-supplied one is ignored', async () => {
    const { app, AdminSession } = buildTestApp({ orders: [buildOrder({ orderStatus: 'received' })] });
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));
    const cookie = await issueAdminCookie(AdminSession);

    const clientSuppliedDate = '2000-01-01T00:00:00.000Z';
    const res = await fetch(`${baseUrl}/api/admin/orders/CCK-20260808-4F2A`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ orderStatus: 'shipped', shippedAt: clientSuppliedDate }),
    });
    const body = await res.json();
    assert.equal(body.order.orderStatus, 'shipped');
    assert.notEqual(body.order.shippedAt, clientSuppliedDate);
  });

  await t.test('re-PATCHing an already-shipped order with corrected tracking preserves the original shippedAt', async () => {
    const originalShippedAt = new Date('2026-08-01T00:00:00Z');
    const { app, AdminSession } = buildTestApp({
      orders: [buildOrder({ orderStatus: 'shipped', shippedAt: originalShippedAt, carrier: 'USPS', trackingNumber: 'OLD123' })],
    });
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));
    const cookie = await issueAdminCookie(AdminSession);

    const res = await fetch(`${baseUrl}/api/admin/orders/CCK-20260808-4F2A`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ orderStatus: 'shipped', carrier: 'UPS', trackingNumber: 'NEW456' }),
    });
    const body = await res.json();
    assert.equal(body.order.carrier, 'UPS');
    assert.equal(body.order.trackingNumber, 'NEW456');
    assert.equal(new Date(body.order.shippedAt).toISOString(), originalShippedAt.toISOString());
  });

  await t.test('a concurrent status change landing between read and write causes 409, never a silent overwrite', async () => {
    const { app, Order, AdminSession } = buildTestApp({ orders: [buildOrder({ orderStatus: 'received' })] });
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));
    const cookie = await issueAdminCookie(AdminSession);

    // Fires right before the write commits — simulating another admin's
    // request winning the race in the exact gap between this request's own
    // read and write.
    Order.__setOnBeforeUpdate(() => {
      const doc = Order.__store.find((o) => o.orderNumber === 'CCK-20260808-4F2A');
      doc.orderStatus = 'cancelled';
    });

    const res = await fetch(`${baseUrl}/api/admin/orders/CCK-20260808-4F2A`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ orderStatus: 'processing' }),
    });
    assert.equal(res.status, 409);

    const doc = Order.__store.find((o) => o.orderNumber === 'CCK-20260808-4F2A');
    assert.equal(doc.orderStatus, 'cancelled', "the loser's write must never overwrite the winner's status");
  });
});

// ---- Shipping-email side effect ----

test('admin PATCH shipping-email side effect', async (t) => {
  await t.test('a genuine first transition into shipped sends exactly one shipping email', async () => {
    const { app, AdminSession, sentEmails } = buildTestApp({ orders: [buildOrder({ orderStatus: 'received' })] });
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));
    const cookie = await issueAdminCookie(AdminSession);

    await fetch(`${baseUrl}/api/admin/orders/CCK-20260808-4F2A`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ orderStatus: 'shipped', carrier: 'USPS', trackingNumber: '9400111899223197428490' }),
    });
    await new Promise((r) => setTimeout(r, 20)); // let the fire-and-forget send settle

    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].to, 'buyer@example.com');
    assert.match(sentEmails[0].subject, /Shipped/);
    assert.match(sentEmails[0].html, /USPS/);
    assert.match(sentEmails[0].html, /9400111899223197428490/);
  });

  await t.test('re-PATCHing an already-shipped order sends no additional shipping email', async () => {
    const { app, AdminSession, sentEmails } = buildTestApp({
      orders: [buildOrder({ orderStatus: 'shipped', shippedAt: new Date('2026-08-01T00:00:00Z') })],
    });
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));
    const cookie = await issueAdminCookie(AdminSession);

    await fetch(`${baseUrl}/api/admin/orders/CCK-20260808-4F2A`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ orderStatus: 'shipped', carrier: 'USPS', trackingNumber: 'X' }),
    });
    await new Promise((r) => setTimeout(r, 20));

    assert.equal(sentEmails.length, 0);
  });

  await t.test('a transition that never enters shipped sends no shipping email', async () => {
    const { app, AdminSession, sentEmails } = buildTestApp({ orders: [buildOrder({ orderStatus: 'received' })] });
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));
    const cookie = await issueAdminCookie(AdminSession);

    await fetch(`${baseUrl}/api/admin/orders/CCK-20260808-4F2A`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ orderStatus: 'processing' }),
    });
    await new Promise((r) => setTimeout(r, 20));

    assert.equal(sentEmails.length, 0);
  });

  await t.test('a shipping-email failure does not roll back the already-saved shipped status', async () => {
    const failingSendEmail = async () => ({ ok: false, error: 'Resend is down' });
    const { app, AdminSession } = buildTestApp({ orders: [buildOrder({ orderStatus: 'received' })], sendEmailImpl: failingSendEmail });
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));
    const cookie = await issueAdminCookie(AdminSession);

    const res = await fetch(`${baseUrl}/api/admin/orders/CCK-20260808-4F2A`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ orderStatus: 'shipped' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.order.orderStatus, 'shipped');
  });
});

// ---- Resend confirmation ----

test('admin resend order confirmation', async (t) => {
  await t.test("admin can resend the confirmation to the order's own stored email", async () => {
    const { app, AdminSession, sentEmails } = buildTestApp({ orders: [buildOrder()] });
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));
    const cookie = await issueAdminCookie(AdminSession);

    const res = await fetch(`${baseUrl}/api/admin/orders/CCK-20260808-4F2A/resend-confirmation`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    assert.equal(res.status, 200);
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].to, 'buyer@example.com');
  });

  await t.test('unauthorized (no session) cannot resend', async () => {
    const { app, sentEmails } = buildTestApp({ orders: [buildOrder()] });
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const res = await fetch(`${baseUrl}/api/admin/orders/CCK-20260808-4F2A/resend-confirmation`, { method: 'POST' });
    assert.equal(res.status, 401);
    assert.equal(sentEmails.length, 0);
  });

  await t.test('the caller cannot supply an arbitrary destination email — only the stored order email is ever used', async () => {
    const { app, AdminSession, sentEmails } = buildTestApp({ orders: [buildOrder()] });
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));
    const cookie = await issueAdminCookie(AdminSession);

    await fetch(`${baseUrl}/api/admin/orders/CCK-20260808-4F2A/resend-confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ email: 'attacker@example.com' }),
    });
    assert.equal(sentEmails[0].to, 'buyer@example.com');
  });

  await t.test('resending for a missing order returns 404 and sends nothing', async () => {
    const { app, AdminSession, sentEmails } = buildTestApp({ orders: [] });
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));
    const cookie = await issueAdminCookie(AdminSession);

    const res = await fetch(`${baseUrl}/api/admin/orders/CCK-NOPE-0000/resend-confirmation`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    assert.equal(res.status, 404);
    assert.equal(sentEmails.length, 0);
  });

  await t.test('an email-send failure is reported as a failure and does not alter the order', async () => {
    const failingSendEmail = async () => ({ ok: false, error: 'Resend is down' });
    const { app, Order, AdminSession } = buildTestApp({ orders: [buildOrder()], sendEmailImpl: failingSendEmail });
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));
    const cookie = await issueAdminCookie(AdminSession);

    const res = await fetch(`${baseUrl}/api/admin/orders/CCK-20260808-4F2A/resend-confirmation`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    assert.equal(res.status, 500);
    const doc = Order.__store.find((o) => o.orderNumber === 'CCK-20260808-4F2A');
    assert.equal(doc.orderStatus, 'received');
  });

  await t.test('reuses the real order-confirmation template — not a duplicate/reimplemented one', async () => {
    const { app, AdminSession, sentEmails } = buildTestApp({ orders: [buildOrder()] });
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));
    const cookie = await issueAdminCookie(AdminSession);

    await fetch(`${baseUrl}/api/admin/orders/CCK-20260808-4F2A/resend-confirmation`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    const expected = buildOrderConfirmationEmail(buildOrder(), { frontendBaseUrl: FRONTEND_BASE_URL });
    assert.equal(sentEmails[0].subject, expected.subject);
  });
});
