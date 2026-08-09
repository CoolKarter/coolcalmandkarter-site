'use strict';

// End-to-end coverage for the hardened POST /api/newsletter: real
// normalize-email.js validation (replacing the old `.includes('@')`
// check) + real newsletter-rate-limit.js constants + real
// process-newsletter-signup.js + real email-templates.js builders,
// against a fake in-memory NewsletterEmail model and an injectable fake
// sendEmail (no real Resend network call ever occurs in this suite).

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { normalizeEmail } = require('../lib/normalize-email');
const { processNewsletterSignup } = require('../lib/process-newsletter-signup');
const { NEWSLETTER_RATE_LIMIT_WINDOW_MS, NEWSLETTER_RATE_LIMIT_MAX } = require('../lib/newsletter-rate-limit');
const { buildNewsletterWelcomeEmail, buildNewsletterAdminNotification } = require('../lib/email-templates');

const ADMIN_EMAIL = 'admin@example.com';

function makeDuplicateKeyError() {
  const err = new Error('E11000 duplicate key error collection: test.newsletteremails index: email_1');
  err.code = 11000;
  return err;
}

function createFakeNewsletterModel({ existing = [] } = {}) {
  const store = [...existing];
  class FakeNewsletterEmail {
    constructor(data) {
      Object.assign(this, data);
    }
    async save() {
      if (store.includes(this.email)) throw makeDuplicateKeyError();
      store.push(this.email);
      return this;
    }
  }
  FakeNewsletterEmail.__store = store;
  return FakeNewsletterEmail;
}

function buildTestApp({ sendEmailImpl, existing = [] } = {}) {
  const app = express();
  app.use(express.json());

  const NewsletterEmailModel = createFakeNewsletterModel({ existing });
  const sentEmails = [];
  const sendEmail =
    sendEmailImpl ||
    (async (payload) => {
      sentEmails.push(payload);
      return { ok: true, id: 'email_test_1' };
    });

  const newsletterLimiter = rateLimit({
    windowMs: NEWSLETTER_RATE_LIMIT_WINDOW_MS,
    max: NEWSLETTER_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
  });

  app.post('/api/newsletter', newsletterLimiter, async (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    const emailResult = normalizeEmail(req.body?.email);
    if (!emailResult.ok) {
      return res.status(400).json({ error: emailResult.error });
    }
    const email = emailResult.email;

    let signupResult;
    try {
      signupResult = await processNewsletterSignup({ email, ip, NewsletterEmailModel });
    } catch (err) {
      return res.status(500).json({ error: 'Server error during signup' });
    }

    if (signupResult.duplicate) {
      return res.status(409).json({ error: 'You’ve already signed up.' });
    }

    res.status(200).json({ message: 'Signup successful!' });

    sendEmail({ to: email, ...buildNewsletterWelcomeEmail({ frontendBaseUrl: 'https://staging.example.com' }) }).catch(() => {});
    sendEmail({ to: ADMIN_EMAIL, ...buildNewsletterAdminNotification({ email, ip }, { frontendBaseUrl: 'https://staging.example.com' }) }).catch(() => {});
  });

  return { app, sentEmails, NewsletterEmailModel };
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

test('POST /api/newsletter', async (t) => {
  await t.test('a valid email is normalized, persisted lowercased, and both welcome + admin emails are attempted (no real Resend call)', async () => {
    const { app, sentEmails, NewsletterEmailModel } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const res = await fetch(`${baseUrl}/api/newsletter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '  Fan@Example.com  ' }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(NewsletterEmailModel.__store, ['fan@example.com']);

    await new Promise((r) => setTimeout(r, 20)); // let the fire-and-forget sends settle
    assert.equal(sentEmails.length, 2);
    assert.equal(sentEmails[0].to, 'fan@example.com');
    assert.equal(sentEmails[1].to, ADMIN_EMAIL);
  });

  await t.test('a malformed email is rejected with 400, using the real shared email validation', async () => {
    const { app, NewsletterEmailModel } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const res = await fetch(`${baseUrl}/api/newsletter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    assert.equal(res.status, 400);
    assert.deepEqual(NewsletterEmailModel.__store, []);
  });

  await t.test('a missing email is rejected with 400, not a 500', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const res = await fetch(`${baseUrl}/api/newsletter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });

  await t.test('a duplicate signup still returns 409, even with different casing than the stored (normalized) entry', async () => {
    const { app } = buildTestApp({ existing: ['fan@example.com'] });
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const res = await fetch(`${baseUrl}/api/newsletter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'FAN@EXAMPLE.COM' }),
    });
    assert.equal(res.status, 409);
  });

  await t.test('persistence/email decoupling remains intact — a signup still succeeds (200) even if the welcome email fails', async () => {
    const failingSendEmail = async () => {
      throw new Error('Resend is down');
    };
    const { app, NewsletterEmailModel } = buildTestApp({ sendEmailImpl: failingSendEmail });
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const res = await fetch(`${baseUrl}/api/newsletter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fan2@example.com' }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(NewsletterEmailModel.__store, ['fan2@example.com']); // still persisted
  });

  await t.test('the rate limiter is actually wired — the request beyond the configured max is blocked with 429', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    let lastStatus;
    for (let i = 0; i < NEWSLETTER_RATE_LIMIT_MAX; i += 1) {
      const res = await fetch(`${baseUrl}/api/newsletter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `fan${i}@example.com` }),
      });
      lastStatus = res.status;
    }
    assert.equal(lastStatus, 200);

    const blockedRes = await fetch(`${baseUrl}/api/newsletter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'one-more@example.com' }),
    });
    assert.equal(blockedRes.status, 429);
  });
});
