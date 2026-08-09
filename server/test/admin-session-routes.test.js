'use strict';

// End-to-end coverage for the Phase 13F admin session system:
//   POST /api/admin/session/login
//   POST /api/admin/session/logout
//   GET  /api/admin/session
// plus the authorization boundary it creates for /api/admin/* (replacing
// Basic Auth there) and proof that the legacy Basic-Auth-protected
// GET /api/orders is completely unaffected.
//
// Builds a small real Express app wired with the REAL lib functions
// (verifyAdminCredentials, createAdminSession/authenticateAdminSession/
// deleteAdminSession, the admin cookie helpers) plus real express,
// real cookie-parser, real express-rate-limit, and real express-basic-auth
// for the legacy-route comparison — only the route-wiring itself (which
// mirrors server.js's actual admin-session routes) is hand-written here,
// same trade-off already accepted in admin-route-auth.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const basicAuth = require('express-basic-auth');
const { verifyAdminCredentials } = require('../lib/admin-credentials');
const { createAdminSession, authenticateAdminSession, deleteAdminSession } = require('../lib/admin-session');
const {
  setAdminSessionCookie,
  readAdminSessionCookie,
  clearAdminSessionCookie,
  SECURE_COOKIE_NAME,
  INSECURE_COOKIE_NAME,
} = require('../lib/admin-session-cookie');
const { ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS, ADMIN_LOGIN_RATE_LIMIT_MAX } = require('../lib/admin-login-rate-limit');
const { createFakeCustomerSessionModel } = require('./helpers/fake-token-model');

const REAL_ADMIN_PASSWORD = 'correct-horse-battery-staple';

function buildTestApp({ adminPassword = REAL_ADMIN_PASSWORD } = {}) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(cookieParser());

  const AdminSession = createFakeCustomerSessionModel();

  const adminLoginLimiter = rateLimit({
    windowMs: ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS,
    max: ADMIN_LOGIN_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Too many login attempts. Please try again later.' },
  });

  app.post('/api/admin/session/login', adminLoginLimiter, async (req, res) => {
    const { username, password } = req.body || {};
    const result = verifyAdminCredentials({ username, password, adminPassword });

    if (result.configError) {
      return res.status(500).json({ error: 'Admin login is not available right now.' });
    }
    if (!result.ok) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const { rawToken } = await createAdminSession({ AdminSessionModel: AdminSession });
    setAdminSessionCookie(req, res, rawToken);
    res.status(200).json({ ok: true });
  });

  app.post('/api/admin/session/logout', async (req, res) => {
    const rawToken = readAdminSessionCookie(req);
    await deleteAdminSession({ rawToken, AdminSessionModel: AdminSession });
    clearAdminSessionCookie(req, res);
    res.status(200).json({ ok: true });
  });

  app.get('/api/admin/session', async (req, res) => {
    const rawToken = readAdminSessionCookie(req);
    const result = await authenticateAdminSession({ rawToken, AdminSessionModel: AdminSession });
    res.status(200).json({ authenticated: result.ok });
  });

  async function requireAdminSession(req, res, next) {
    const rawToken = readAdminSessionCookie(req);
    const result = await authenticateAdminSession({ rawToken, AdminSessionModel: AdminSession });
    if (!result.ok) return res.status(401).json({ error: 'Not authenticated.' });
    next();
  }

  app.get('/api/admin/orders', requireAdminSession, (req, res) => {
    res.status(200).json({ orders: [] });
  });

  // Legacy admin route — real express-basic-auth, completely independent
  // of everything above, proving the two systems don't interact.
  const legacyAdminAuth = basicAuth({ users: { admin: adminPassword || 'unused' }, challenge: true });
  app.get('/api/orders', legacyAdminAuth, (req, res) => {
    res.status(200).json([]);
  });

  // Stand-in for the real customer-session-cookie-protected route, just
  // enough to prove a customer session cookie does NOT grant admin access
  // (and, conversely, genuinely grants access to its own route).
  app.get('/api/my-orders', (req, res) => {
    if (req.headers.cookie === 'cck_session=customer-session-token') {
      return res.status(200).json({ orders: [] });
    }
    res.status(401).json({ error: 'Not authenticated.' });
  });

  return { app, AdminSession };
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

/** Extracts just the "name=value" part of a Set-Cookie header, for reuse as a Cookie header on a later request. */
function extractCookiePair(res) {
  const raw = res.headers.get('set-cookie');
  if (!raw) return null;
  return raw.split(';')[0];
}

async function loginAndGetCookie(baseUrl, { headers = {} } = {}) {
  const res = await fetch(`${baseUrl}/api/admin/session/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ username: 'admin', password: REAL_ADMIN_PASSWORD }),
  });
  return { res, cookie: extractCookiePair(res) };
}

// ---- Admin login ----

test('admin session login', async (t) => {
  await t.test('correct credentials create an admin session and set the cookie', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const { res, cookie } = await loginAndGetCookie(baseUrl);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { ok: true });
    assert.ok(cookie, 'expected a Set-Cookie header on successful login');
    assert.match(cookie, new RegExp(`^${INSECURE_COOKIE_NAME}=`)); // plain HTTP test server
  });

  await t.test('wrong username is rejected with a generic message', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const res = await fetch(`${baseUrl}/api/admin/session/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'not-admin', password: REAL_ADMIN_PASSWORD }),
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Invalid username or password.');
  });

  await t.test('wrong password is rejected with the identical generic message', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const res = await fetch(`${baseUrl}/api/admin/session/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong-password' }),
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Invalid username or password.');
  });

  await t.test('missing ADMIN_PASSWORD fails closed with a generic 500 — no stack trace, no internals leaked', async () => {
    // Explicit `null`, not `undefined` — buildTestApp's default parameter
    // only kicks in for `undefined`, so this is the actual way to force
    // "ADMIN_PASSWORD genuinely not configured" rather than silently
    // falling back to the real test password.
    const { app } = buildTestApp({ adminPassword: null });
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const res = await fetch(`${baseUrl}/api/admin/session/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'anything' }),
    });
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.ok(!text.toLowerCase().includes('at '), 'response must not contain a stack-trace line');
    assert.ok(!text.includes('node_modules'));
    assert.ok(!text.toUpperCase().includes('ADMIN_PASSWORD'));
    const body = JSON.parse(text);
    assert.equal(typeof body.error, 'string');
  });

  await t.test('the submitted password never appears anywhere in the response body', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const res = await fetch(`${baseUrl}/api/admin/session/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: REAL_ADMIN_PASSWORD }),
    });
    const text = await res.text();
    assert.ok(!text.includes(REAL_ADMIN_PASSWORD));
  });

  await t.test('login rate limiting: after 5 failed attempts, the 6th is blocked, but a correct login still succeeds afterward from a fresh limiter window is not required here — only that failures are capped', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    let lastStatus;
    for (let i = 0; i < ADMIN_LOGIN_RATE_LIMIT_MAX; i += 1) {
      const res = await fetch(`${baseUrl}/api/admin/session/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrong' }),
      });
      lastStatus = res.status;
    }
    assert.equal(lastStatus, 401); // the 5th failed attempt is still processed normally

    const blockedRes = await fetch(`${baseUrl}/api/admin/session/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong' }),
    });
    assert.equal(blockedRes.status, 429);
  });

  await t.test('a successful login does not count against the failed-attempt limit (skipSuccessfulRequests)', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    for (let i = 0; i < ADMIN_LOGIN_RATE_LIMIT_MAX; i += 1) {
      await loginAndGetCookie(baseUrl);
    }
    const { res } = await loginAndGetCookie(baseUrl);
    assert.equal(res.status, 200);
  });
});

// ---- Session cookie attributes ----

test('admin session cookie attributes', async (t) => {
  await t.test('over plain HTTP, uses the non-__Host- cookie name with Secure absent', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const res = await fetch(`${baseUrl}/api/admin/session/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: REAL_ADMIN_PASSWORD }),
    });
    const setCookie = res.headers.get('set-cookie');
    assert.match(setCookie, new RegExp(`^${INSECURE_COOKIE_NAME}=`));
    assert.ok(!setCookie.includes('Secure'));
    assert.ok(!setCookie.includes('Domain='));
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Path=\//);
  });

  await t.test('behind a trusted HTTPS proxy (x-forwarded-proto), uses the __Host- prefixed name with Secure present', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const res = await fetch(`${baseUrl}/api/admin/session/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-proto': 'https' },
      body: JSON.stringify({ username: 'admin', password: REAL_ADMIN_PASSWORD }),
    });
    const setCookie = res.headers.get('set-cookie');
    assert.match(setCookie, new RegExp(`^${SECURE_COOKIE_NAME}=`));
    assert.match(setCookie, /Secure/);
    assert.ok(!setCookie.includes('Domain='));
  });

  await t.test('Max-Age matches the fixed 8-hour session (28800 seconds)', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const res = await fetch(`${baseUrl}/api/admin/session/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: REAL_ADMIN_PASSWORD }),
    });
    const setCookie = res.headers.get('set-cookie');
    assert.match(setCookie, /Max-Age=28800/);
  });
});

// ---- Logout ----

test('admin session logout', async (t) => {
  await t.test('logout invalidates the session — the same cookie no longer authenticates', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const { cookie } = await loginAndGetCookie(baseUrl);
    const beforeLogout = await fetch(`${baseUrl}/api/admin/orders`, { headers: { Cookie: cookie } });
    assert.equal(beforeLogout.status, 200);

    await fetch(`${baseUrl}/api/admin/session/logout`, { method: 'POST', headers: { Cookie: cookie } });

    const afterLogout = await fetch(`${baseUrl}/api/admin/orders`, { headers: { Cookie: cookie } });
    assert.equal(afterLogout.status, 401);
  });

  await t.test('logout clears the cookie on the response', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const { cookie } = await loginAndGetCookie(baseUrl);
    const res = await fetch(`${baseUrl}/api/admin/session/logout`, { method: 'POST', headers: { Cookie: cookie } });
    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie);
    assert.match(setCookie, /Expires=|Max-Age=0/);
  });

  await t.test('logout is idempotent — succeeds even with no active session', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const res = await fetch(`${baseUrl}/api/admin/session/logout`, { method: 'POST' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { ok: true });
  });

  await t.test('logout is idempotent — a second consecutive logout call also succeeds', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const { cookie } = await loginAndGetCookie(baseUrl);
    const first = await fetch(`${baseUrl}/api/admin/session/logout`, { method: 'POST', headers: { Cookie: cookie } });
    const second = await fetch(`${baseUrl}/api/admin/session/logout`, { method: 'POST', headers: { Cookie: cookie } });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
  });
});

// ---- Session status ----

test('admin session status', async (t) => {
  await t.test('returns authenticated:false with no session, never a 401', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const res = await fetch(`${baseUrl}/api/admin/session`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { authenticated: false });
  });

  await t.test('returns authenticated:true with a valid session, and never leaks the token/hash', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const { cookie } = await loginAndGetCookie(baseUrl);
    const res = await fetch(`${baseUrl}/api/admin/session`, { headers: { Cookie: cookie } });
    const body = await res.json();
    assert.deepEqual(body, { authenticated: true });
  });
});

// ---- Authorization boundary ----

test('admin API authorization boundary', async (t) => {
  await t.test('unauthenticated GET /api/admin/orders returns a plain JSON 401, never a WWW-Authenticate challenge', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const res = await fetch(`${baseUrl}/api/admin/orders`);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('www-authenticate'), null);
    const body = await res.json();
    assert.equal(typeof body.error, 'string');
  });

  await t.test('a customer-session cookie does not grant admin access, though it genuinely authenticates its own route', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const adminAttempt = await fetch(`${baseUrl}/api/admin/orders`, { headers: { Cookie: 'cck_session=customer-session-token' } });
    assert.equal(adminAttempt.status, 401);

    const customerAttempt = await fetch(`${baseUrl}/api/my-orders`, { headers: { Cookie: 'cck_session=customer-session-token' } });
    assert.equal(customerAttempt.status, 200);
  });

  await t.test('a valid admin session grants access', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const { cookie } = await loginAndGetCookie(baseUrl);
    const res = await fetch(`${baseUrl}/api/admin/orders`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
  });

  await t.test('an expired admin session cannot access', async () => {
    const { app, AdminSession } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const { cookie } = await loginAndGetCookie(baseUrl);
    // Force the session this cookie refers to into the past.
    AdminSession.__store[0].expiresAt = new Date(Date.now() - 1000);

    const res = await fetch(`${baseUrl}/api/admin/orders`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 401);
  });

  await t.test('the legacy Basic-Auth-protected GET /api/orders is completely unaffected — still requires Basic Auth, still works with correct credentials', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const noAuth = await fetch(`${baseUrl}/api/orders`);
    assert.equal(noAuth.status, 401);
    assert.match(noAuth.headers.get('www-authenticate') || '', /^Basic/);

    const validAuth = await fetch(`${baseUrl}/api/orders`, {
      headers: { Authorization: `Basic ${Buffer.from(`admin:${REAL_ADMIN_PASSWORD}`).toString('base64')}` },
    });
    assert.equal(validAuth.status, 200);
  });

  await t.test('a valid admin session cookie does not satisfy the legacy Basic-Auth route', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const { cookie } = await loginAndGetCookie(baseUrl);
    const res = await fetch(`${baseUrl}/api/orders`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 401);
  });
});
