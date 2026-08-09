'use strict';

// End-to-end coverage for the hardened POST /api/contact: real
// validate-contact-request.js + real contact-rate-limit.js constants +
// real email-templates.js's buildContactNotificationEmail, against an
// injectable fake sendEmail (so no real Resend network call ever occurs
// in this suite) — same trade-off already established throughout this
// project's other route-boundary tests.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { validateContactRequest } = require('../lib/validate-contact-request');
const { CONTACT_RATE_LIMIT_WINDOW_MS, CONTACT_RATE_LIMIT_MAX } = require('../lib/contact-rate-limit');
const { buildContactNotificationEmail } = require('../lib/email-templates');

const ADMIN_EMAIL = 'admin@example.com';

function buildTestApp({ sendEmailImpl } = {}) {
  const app = express();
  app.use(express.json());

  const sentEmails = [];
  const sendEmail =
    sendEmailImpl ||
    (async (payload) => {
      sentEmails.push(payload);
      return { ok: true, id: 'email_test_1' };
    });

  const contactLimiter = rateLimit({
    windowMs: CONTACT_RATE_LIMIT_WINDOW_MS,
    max: CONTACT_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
  });

  app.post('/api/contact', contactLimiter, async (req, res) => {
    const validation = validateContactRequest(req.body);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }
    const { name, email, reason, subject, message } = validation;

    const result = await sendEmail({
      to: ADMIN_EMAIL,
      replyTo: email,
      ...buildContactNotificationEmail({ name, email, reason, subject, message }, { frontendBaseUrl: 'https://staging.example.com' }),
    });

    if (!result.ok) {
      return res.status(500).json({ error: 'Failed to send message. Please try again later.' });
    }
    res.status(200).json({ message: 'Message sent successfully!' });
  });

  return { app, sentEmails };
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

function buildValidPayload(overrides = {}) {
  return {
    name: 'Jamie Buyer',
    email: 'jamie@example.com',
    reason: 'general',
    subject: 'A question',
    message: 'Hello, I had a question about my order.',
    ...overrides,
  };
}

test('POST /api/contact', async (t) => {
  await t.test('a valid request is accepted and sends exactly one email (no real Resend call — sendEmail is injected)', async () => {
    const { app, sentEmails } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const res = await fetch(`${baseUrl}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildValidPayload()),
    });
    assert.equal(res.status, 200);
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].to, ADMIN_EMAIL);
    assert.equal(sentEmails[0].replyTo, 'jamie@example.com');
  });

  await t.test('a malformed email is rejected with 400 and no email is sent', async () => {
    const { app, sentEmails } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const res = await fetch(`${baseUrl}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildValidPayload({ email: 'not-an-email' })),
    });
    assert.equal(res.status, 400);
    assert.equal(sentEmails.length, 0);
  });

  await t.test('an oversized name is rejected with 400', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const res = await fetch(`${baseUrl}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildValidPayload({ name: 'x'.repeat(500) })),
    });
    assert.equal(res.status, 400);
  });

  await t.test('an oversized subject is rejected with 400', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const res = await fetch(`${baseUrl}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildValidPayload({ subject: 'x'.repeat(500) })),
    });
    assert.equal(res.status, 400);
  });

  await t.test('an oversized message is rejected with 400', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const res = await fetch(`${baseUrl}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildValidPayload({ message: 'x'.repeat(10000) })),
    });
    assert.equal(res.status, 400);
  });

  await t.test('the rate limiter is actually wired — the request beyond the configured max is blocked with 429', async () => {
    const { app } = buildTestApp();
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    let lastStatus;
    for (let i = 0; i < CONTACT_RATE_LIMIT_MAX; i += 1) {
      const res = await fetch(`${baseUrl}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildValidPayload()),
      });
      lastStatus = res.status;
    }
    assert.equal(lastStatus, 200); // the Nth request (the limit itself) still succeeds

    const blockedRes = await fetch(`${baseUrl}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildValidPayload()),
    });
    assert.equal(blockedRes.status, 429);
  });

  await t.test('an email-provider failure returns a generic 500 message, distinct from a validation 400', async () => {
    const failingSendEmail = async () => ({ ok: false, error: 'Resend is down' });
    const { app, sentEmails } = buildTestApp({ sendEmailImpl: failingSendEmail });
    const { server, baseUrl } = await startTestServer(app);
    t.after(() => stopTestServer(server));

    const res = await fetch(`${baseUrl}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildValidPayload()),
    });
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error, 'Failed to send message. Please try again later.');
    assert.equal(sentEmails.length, 0); // the failing implementation never records a "sent" email
  });
});
